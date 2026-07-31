// Context extraction — the core domain rule of PDF-LLM (CONTEXT.md:
// "上下文" / "上下文降级").
//
// Given the raw text of a page (or any text block) and the character range the
// user selected, produce:
//   - selectedText: the exact highlighted text
//   - contextText:  the paragraph containing the Selection, OR (when no
//                   paragraph boundary can be detected) N sentences around it.
//
// This module is pure and framework-independent so it can be unit-tested
// without EmbedPDF / the DOM (Seam 1 in docs/spec.md).

import type { ExtractedContext, SelectionRange } from './types'

/**
 * Number of sentences before and after the Selection used by the Context
 * Fallback (story 9). When paragraph boundaries are undetectable we widen the
 * Context to this many sentences on each side of the Selection.
 */
export const FALLBACK_SENTENCE_WINDOW = 2

/**
 * A blank line: one newline followed by one or more newline / whitespace-only
 * lines. Used as the primary paragraph delimiter. Single newlines are treated
 * as soft line wraps within a paragraph (pdf.js emits one line per text item).
 */
const PARAGRAPH_SEPARATOR = /\r?\n[ \t]*(?:\r?\n[ \t]*)+/g

/** Split `text` by `sepRegex` while retaining the source offsets of each part. */
function splitByOffsets(
  text: string,
  sepRegex: RegExp,
): { text: string; start: number; end: number }[] {
  const parts: { text: string; start: number; end: number }[] = []
  let cursor = 0
  // Reset stateful regex before use.
  sepRegex.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = sepRegex.exec(text)) !== null) {
    parts.push({ text: text.slice(cursor, match.index), start: cursor, end: match.index })
    cursor = match.index + match[0].length
  }
  parts.push({ text: text.slice(cursor), start: cursor, end: text.length })
  return parts
}

/**
 * Split a single text block into sentences, retaining source offsets. Split
 * points are sentence-ending punctuation (。.!?！？;；) or a newline.
 */
function splitSentences(
  text: string,
): { text: string; start: number; end: number }[] {
  const sentences: { text: string; start: number; end: number }[] = []
  const tokenRegex = /[^。.!?！？;；\r\n]+(?:[。.!?！？;；]+|\r?\n)/g
  let match: RegExpExecArray | null
  while ((match = tokenRegex.exec(text)) !== null) {
    sentences.push({ text: match[0], start: match.index, end: match.index + match[0].length })
  }
  // Trailing run that has no terminating punctuation / newline.
  if (tokenRegex.lastIndex < text.length) {
    const tail = text.slice(tokenRegex.lastIndex)
    if (tail.trim().length > 0) {
      sentences.push({ text: tail, start: tokenRegex.lastIndex, end: text.length })
    }
  }
  return sentences
}

/** Does the range [aStart, aEnd) overlap the range [bStart, bEnd)? */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart
}

/**
 * Build the Context Fallback: the `window` sentences on each side of the
 * Selection, taken from a single (boundary-less) text block.
 */
function buildSentenceFallback(
  block: string,
  selection: SelectionRange,
): string {
  const sentences = splitSentences(block)
  if (sentences.length === 0) return ''

  const mid = (selection.start + selection.end) / 2
  let anchorIndex = sentences.findIndex((s) => s.start <= mid && mid < s.end)
  // If the midpoint is not inside any sentence (e.g. selection sits in a
  // separator gap), fall back to the nearest sentence by start offset.
  if (anchorIndex === -1) {
    anchorIndex = sentences.findIndex((s) => s.start >= selection.start)
    if (anchorIndex === -1) anchorIndex = sentences.length - 1
  }

  const from = Math.max(0, anchorIndex - FALLBACK_SENTENCE_WINDOW)
  const to = Math.min(sentences.length, anchorIndex + FALLBACK_SENTENCE_WINDOW + 1)
  return sentences
    .slice(from, to)
    .map((s) => s.text)
    .join('')
    .trim()
}

/**
 * Resolve a Selection into its surrounding Context.
 *
 * @param rawText  The full text of the page / block the Selection lives in.
 * @param selection The character range [start, end) of the Selection inside
 *                  `rawText`.
 */
export function extractContext(
  rawText: string,
  selection: SelectionRange,
): ExtractedContext {
  const selectedText = rawText.slice(selection.start, selection.end).trim()

  // Story 4 / spec: empty or whitespace-only selection yields empty Context.
  if (selectedText.length === 0) {
    return { selectedText: '', contextText: '' }
  }

  const paragraphs = splitByOffsets(rawText, PARAGRAPH_SEPARATOR)

  // No paragraph boundaries anywhere → Context Fallback (story 9).
  if (paragraphs.length === 1) {
    const contextText = buildSentenceFallback(rawText, selection)
    return { selectedText, contextText }
  }

  // Paragraph mode: collect every paragraph that overlaps the Selection.
  const enclosing = paragraphs
    .filter((p) => overlaps(selection.start, selection.end, p.start, p.end))
    .map((p) => p.text.trim())
    .filter((t) => t.length > 0)

  const contextText = enclosing.length > 0 ? enclosing.join('\n\n') : ''

  // If the Selection somehow matched no paragraph content, degrade gracefully
  // to the sentence fallback rather than returning an empty Context.
  if (contextText.length === 0) {
    return { selectedText, contextText: buildSentenceFallback(rawText, selection) }
  }

  return { selectedText, contextText }
}

/**
 * Locate a user's selected text within the page's raw text and return the
 * character range it occupies.
 *
 * This is more robust than mapping DOM selection offsets onto the flattened
 * raw text: the selection string can include line breaks or whitespace that
 * differ from how the raw text was assembled by PDFium. We instead use a direct
 * match, falling back to a whitespace-normalised match so the selection is
 * found even when breaks don't line up exactly. Returns null when the text
 * cannot be located.
 */
export function findSelectionRange(
  rawText: string,
  selectedText: string,
): SelectionRange | null {
  const selected = selectedText.trim()
  if (selected.length === 0) return null

  const direct = rawText.indexOf(selected)
  if (direct !== -1) return { start: direct, end: direct + selected.length }

  // Whitespace (incl. newlines) normalised search.
  const strip = (s: string) => s.replace(/\s+/g, '')
  const nRaw = strip(rawText)
  const nSel = strip(selected)
  const nIndex = nRaw.indexOf(nSel)
  if (nIndex === -1) return null

  // Map normalised positions back to raw indices. normPos[i] is the index of
  // raw char i within the whitespace-free string, or -1 for whitespace.
  let pos = 0
  const normPos: number[] = new Array(rawText.length)
  for (let i = 0; i < rawText.length; i++) {
    if (/\s/.test(rawText[i])) normPos[i] = -1
    else {
      normPos[i] = pos
      pos += 1
    }
  }
  const toRaw = (nPos: number): number => {
    for (let i = 0; i < rawText.length; i++) if (normPos[i] === nPos) return i
    return rawText.length
  }

  const start = toRaw(nIndex)
  const end =
    nIndex + nSel.length >= pos ? rawText.length : toRaw(nIndex + nSel.length)
  return { start, end }
}

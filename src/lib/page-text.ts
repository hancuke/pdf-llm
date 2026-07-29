// Flattens a pdf.js text layer into a raw string, plus the per-item break
// metadata needed to map a DOM selection back to a character range in that
// exact string.
//
// Paragraph breaks are detected from layout: when the vertical gap between two
// consecutive text items exceeds ~1.3x the line height, a blank line
// (`\n\n`) is inserted; an ordinary end-of-line gets a single `\n`. This lets
// {@link extractContext} prefer the enclosing paragraph (story 8) on normal
// PDFs, while messy / multi-column extracts fall back to the sentence window
// (story 9).
//
// Kept free of any pdf.js import so it is a pure, unit-testable function.

import type { TextContent } from 'pdfjs-dist/types/src/display/api'

/** How a text item is separated from the preceding one in the raw string. */
export type LeadingBreak = 0 | 1 | 2 // none | line (\n) | paragraph (\n\n)

/** A text item with the break that precedes it in the flattened string. */
export interface PageTextItem {
  str: string
  leadingBreak: LeadingBreak
}

export interface PageText {
  text: string
  items: PageTextItem[]
}

/** Vertical gap multiplier over line height that counts as a paragraph break. */
const PARAGRAPH_GAP_FACTOR = 1.3

export function buildPageText(content: TextContent): PageText {
  let text = ''
  const items: PageTextItem[] = []
  let prevY: number | null = null
  let prevHeight = 0

  for (const raw of content.items) {
    if (!('str' in raw)) continue
    const y = raw.transform[5]
    let leadingBreak: LeadingBreak = 0
    if (prevY !== null) {
      const gap = prevY - y
      if (gap > prevHeight * PARAGRAPH_GAP_FACTOR) {
        leadingBreak = 2
      } else if (raw.hasEOL) {
        leadingBreak = 1
      }
    }

    text += (leadingBreak === 2 ? '\n\n' : leadingBreak === 1 ? '\n' : '') + raw.str
    items.push({ str: raw.str, leadingBreak })
    prevY = y
    prevHeight = raw.height
  }

  return { text, items }
}

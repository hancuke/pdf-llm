// Normalises PDFium-extracted page text into a raw string suitable for Context
// extraction (see context.ts).
//
// pdf.js exposed per-item geometry, which let the old buildPageText detect
// paragraph breaks from vertical gaps. PDFium's extractText returns a plain
// string (with newlines where the PDF has them) and no geometry, so the layout
// heuristic is no longer possible — instead we just tidy whitespace. The
// sentence-window fallback in extractContext (story 9) absorbs the loss of
// explicit paragraph boundaries.
//
// Kept free of any EmbedPDF/pdf.js import so it is a pure, unit-testable
// function.

export interface PageText {
  text: string
}

/**
 * Normalise raw PDFium text:
 *  - CRLF -> LF
 *  - strip trailing whitespace on each line
 *  - collapse 3+ consecutive newlines into a single blank line (`\n\n`)
 *  - trim the whole block
 */
export function buildPageText(raw: string): PageText {
  const text = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { text }
}

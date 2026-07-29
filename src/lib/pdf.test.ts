import { describe, it, expect } from 'vitest'
import { buildPageText } from './page-text'
import type { TextContent } from 'pdfjs-dist/types/src/display/api'

// Minimal TextContent-shaped input (only the fields buildPageText reads).
function makeContent(
  items: Array<{ str: string; hasEOL?: boolean; y: number; height: number }>,
): TextContent {
  return {
    items: items.map((it) => ({
      str: it.str,
      hasEOL: it.hasEOL ?? false,
      height: it.height,
      transform: [1, 0, 0, 1, 0, it.y] as unknown as number[],
      dir: 'ltr',
      width: 10,
      fontName: 'font',
    })),
  } as unknown as TextContent
}

describe('buildPageText', () => {
  it('joins wrapped lines with a single newline but paragraph gaps with a blank line', () => {
    const content = makeContent([
      { str: 'line one', hasEOL: true, y: 100, height: 10 },
      { str: 'line two', hasEOL: true, y: 88, height: 10 }, // small gap → wrap
      { str: 'new para', hasEOL: true, y: 60, height: 10 }, // large gap → paragraph
    ])

    const result = buildPageText(content)
    expect(result.text).toBe('line one\nline two\n\nnew para')
    expect(result.items.map((i) => i.leadingBreak)).toEqual([0, 1, 2])
  })

  it('skips non-text (marked) items', () => {
    const content = {
      items: [
        { str: 'hello', hasEOL: true, height: 10, transform: [1, 0, 0, 1, 0, 50] },
        { type: 'beginMarkedContent', id: undefined, transform: [] },
      ],
    } as unknown as TextContent

    const result = buildPageText(content)
    expect(result.text).toBe('hello')
    expect(result.items).toHaveLength(1)
  })
})

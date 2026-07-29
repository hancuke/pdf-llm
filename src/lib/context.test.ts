import { describe, it, expect } from 'vitest'
import { extractContext, FALLBACK_SENTENCE_WINDOW } from './context'

describe('extractContext', () => {
  it('returns empty context for an empty / whitespace selection', () => {
    const raw = 'Hello world. This is a test.'
    expect(extractContext(raw, { start: 0, end: 0 })).toEqual({
      selectedText: '',
      contextText: '',
    })
    expect(extractContext(raw, { start: 5, end: 5 })).toEqual({
      selectedText: '',
      contextText: '',
    })
    // whitespace-only selection
    expect(extractContext('   \n  ', { start: 0, end: 5 })).toEqual({
      selectedText: '',
      contextText: '',
    })
  })

  it('returns the whole enclosing paragraph as Context for a single-paragraph selection', () => {
    const raw = 'First paragraph line one.\nFirst paragraph line two.\n\nSecond paragraph here.'
    // Select "line two" inside the first paragraph.
    const selStart = raw.indexOf('line two')
    const selEnd = selStart + 'line two'.length
    const result = extractContext(raw, { start: selStart, end: selEnd })
    expect(result.selectedText).toBe('line two')
    // Context is the entire first paragraph, including text before the selection.
    expect(result.contextText).toBe('First paragraph line one.\nFirst paragraph line two.')
  })

  it('returns the enclosing paragraphs for a multi-paragraph selection', () => {
    const raw = 'Para A part one.\nPara A part two.\n\nPara B part one.\n\nPara C part one.'
    const selStart = raw.indexOf('Para A')
    const selEnd = raw.indexOf('Para B') + 'Para B part one.'.length
    const result = extractContext(raw, { start: selStart, end: selEnd })
    expect(result.selectedText).toContain('Para A')
    expect(result.contextText).toBe(
      'Para A part one.\nPara A part two.\n\nPara B part one.',
    )
  })

  it('falls back to N sentences around the Selection when no paragraph boundary exists', () => {
    // A single block with no blank lines (e.g. a messy multi-column extract).
    const raw =
      'Sentence one is here. Sentence two follows. Target sentence is selected. Sentence four exists. Sentence five too.'
    const target = 'Target sentence is selected'
    const selStart = raw.indexOf(target)
    const selEnd = selStart + target.length
    const result = extractContext(raw, { start: selStart, end: selEnd })

    expect(result.selectedText).toBe(target)
    // Should include FALLBACK_SENTENCE_WINDOW sentences on each side.
    const expected =
      'Sentence one is here. Sentence two follows. Target sentence is selected. Sentence four exists. Sentence five too.'
    expect(result.contextText).toBe(expected)
    expect(result.contextText.startsWith('Sentence one')).toBe(true)
    expect(result.contextText.endsWith('Sentence five too.')).toBe(true)
    expect(FALLBACK_SENTENCE_WINDOW).toBeGreaterThanOrEqual(1)
  })

  it('fallback respects the sentence window size at the start of a block', () => {
    const raw =
      'Alpha sentence. Beta sentence. Gamma sentence. Delta sentence.'
    const target = 'Alpha sentence'
    const selStart = raw.indexOf(target)
    const selEnd = selStart + target.length
    const result = extractContext(raw, { start: selStart, end: selEnd })
    // Window can't go before the start, so only the target + 2 after.
    const expected = 'Alpha sentence. Beta sentence. Gamma sentence.'
    expect(result.contextText).toBe(expected)
  })

  it('handles CJK punctuation when splitting sentences', () => {
    const raw = '第一句内容。第二句内容。目标句子被选中。第四句内容。第五句内容。'
    const target = '目标句子被选中'
    const selStart = raw.indexOf(target)
    const selEnd = selStart + target.length
    const result = extractContext(raw, { start: selStart, end: selEnd })
    expect(result.selectedText).toBe(target)
    expect(result.contextText).toContain('第一句内容')
    expect(result.contextText).toContain('第五句内容')
    expect(result.contextText).toContain(target)
  })
})

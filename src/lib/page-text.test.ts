import { describe, it, expect } from 'vitest'
import { buildPageText } from './page-text'

describe('buildPageText', () => {
  it('joins text and collapses 3+ newlines into a single blank line', () => {
    const result = buildPageText('line one\nline two\n\n\n\nnew para')
    expect(result.text).toBe('line one\nline two\n\nnew para')
  })

  it('normalises CRLF to LF', () => {
    expect(buildPageText('a\r\nb\r\n\r\nc').text).toBe('a\nb\n\nc')
  })

  it('strips trailing whitespace on each line', () => {
    expect(buildPageText('hello   \nworld\t').text).toBe('hello\nworld')
  })

  it('trims the whole block', () => {
    expect(buildPageText('\n\n  spaced  \n\n').text).toBe('spaced')
  })
})

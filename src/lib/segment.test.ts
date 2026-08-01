import { describe, it, expect } from 'vitest'
import { segmentWords } from './segment'

describe('segmentWords', () => {
  it('returns an empty array for empty input', () => {
    expect(segmentWords('')).toEqual([])
  })

  it('marks Latin words as word-like and whitespace as non-word', () => {
    const segs = segmentWords('hello world')
    const words = segs.filter((s) => s.isWord).map((s) => s.text)
    expect(words).toEqual(['hello', 'world'])
    // The space between them is its own non-word segment.
    expect(segs.some((s) => s.text === ' ' && !s.isWord)).toBe(true)
  })

  it('keeps punctuation as non-word segments', () => {
    const segs = segmentWords('hello, world!')
    const words = segs.filter((s) => s.isWord).map((s) => s.text)
    expect(words).toEqual(['hello', 'world'])
    expect(segs.some((s) => s.text === ',' && !s.isWord)).toBe(true)
    expect(segs.some((s) => s.text === '!' && !s.isWord)).toBe(true)
  })

  it('segments CJK into word-like units (no spaces)', () => {
    const segs = segmentWords('我喜欢读书')
    // Every slice should be word-like; there is no whitespace to split on.
    expect(segs.every((s) => s.isWord)).toBe(true)
    expect(segs.map((s) => s.text).join('')).toBe('我喜欢读书')
  })

  it('handles mixed CJK + Latin by flagging only the Latin word', () => {
    const segs = segmentWords('I read 书')
    const words = segs.filter((s) => s.isWord).map((s) => s.text)
    expect(words).toContain('I')
    expect(words).toContain('read')
    expect(words).toContain('书')
  })
})

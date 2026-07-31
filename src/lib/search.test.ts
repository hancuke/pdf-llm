import { describe, it, expect } from 'vitest'
import { normalizeSearchResults } from './search'
import type { SearchResult, TextContext } from '@embedpdf/models'

function hit(
  pageIndex: number,
  before: string,
  match: string,
  after: string,
): SearchResult {
  const context: TextContext = {
    before,
    match,
    after,
    truncatedLeft: false,
    truncatedRight: false,
  }
  return {
    pageIndex,
    charIndex: 0,
    charCount: match.length,
    rects: [],
    context,
  } as SearchResult
}

describe('normalizeSearchResults', () => {
  it('maps each engine result to a UI hit with page, match and snippet', () => {
    const results = [
      hit(0, 'the quick ', 'brown', ' fox jumps'),
      hit(3, 'lazy ', 'dog', ' sleeps'),
    ]

    expect(normalizeSearchResults(results)).toEqual([
      {
        pageIndex: 0,
        matchText: 'brown',
        snippet: 'the quick brown fox jumps',
      },
      {
        pageIndex: 3,
        matchText: 'dog',
        snippet: 'lazy dog sleeps',
      },
    ])
  })

  it('collapses internal whitespace in the snippet', () => {
    const results = [hit(1, 'word\n', 'target', '\tanother')]
    const [first] = normalizeSearchResults(results)
    expect(first.snippet).toBe('word target another')
    expect(first.matchText).toBe('target')
  })

  it('returns an empty array for no results', () => {
    expect(normalizeSearchResults([])).toEqual([])
  })
})

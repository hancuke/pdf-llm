// Pure normalization of the PDF engine's search results into a compact,
// render-ready list. The engine returns rich geometry; the search results only
// need the page, the matched text, and a surrounding snippet. Kept
// framework-independent for unit testing.

import type { SearchResult } from '@embedpdf/models'

export interface SearchHit {
  /** 0-based page index the hit falls on. */
  pageIndex: number
  /** The exact text that matched. */
  matchText: string
  /** A short "before … match … after" snippet for the result row. */
  snippet: string
}

/** Build a single-line snippet from a search result's text context. */
function buildSnippet(result: SearchResult): string {
  const { before, match, after } = result.context
  return `${before}${match}${after}`.replace(/\s+/g, ' ').trim()
}

/** Map engine search results to UI hits, preserving document order. */
export function normalizeSearchResults(results: SearchResult[]): SearchHit[] {
  return results.map((result) => ({
    pageIndex: result.pageIndex,
    matchText: result.context.match,
    snippet: buildSnippet(result),
  }))
}

// Domain types for user bookmarks and reading position (CONTEXT.md: 书签 / 面板).
// A Bookmark stores ONLY a position in the document (page + vertical fraction) —
// never the selected text or conversation. This is the deliberate layering from
// ADR-0006: coordinate state may persist, content state may not.

/** A user-created bookmark: a remembered position, not an excerpt. */
export interface Bookmark {
  /** Stable id for removal. */
  id: string
  /** 0-based page index. */
  pageIndex: number
  /**
   * Vertical position within the page as a percentage (0 = top, 100 = bottom),
   * so we can restore the exact scroll offset on return.
   */
  alignY: number
  /** Human label, e.g. "第 3 页". */
  label: string
  /** Creation timestamp (ms) for ordering. */
  createdAt: number
}

/** The last reading position captured for a document. */
export interface ReadingPosition {
  /** 0-based page index. */
  pageIndex: number
  /** Vertical fraction within the page, 0..100. */
  alignY: number
}

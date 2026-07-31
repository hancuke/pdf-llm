// Pure normalization of the PDF engine's bookmark tree (CONTEXT.md: 目录 / Outline)
// into a flat, render-ready list. Framework- and DOM-independent so it can be
// unit tested without a browser or the PDFium engine.

import type { PdfBookmarkObject } from '@embedpdf/models'

export interface OutlineItem {
  /** Display text of the outline entry. */
  title: string
  /**
   * Target page as a 0-based page index, or -1 when the entry has no resolvable
   * page target (e.g. an action destination like "go to next page").
   */
  pageIndex: number
  /** Nesting depth in the original tree, used for indentation. */
  depth: number
}

/** Resolve an outline node's target to a 0-based page index, or -1 if unknown. */
function resolvePageIndex(node: PdfBookmarkObject): number {
  const target = node.target
  if (
    target &&
    target.type === 'destination' &&
    typeof target.destination.pageIndex === 'number'
  ) {
    return target.destination.pageIndex
  }
  return -1
}

/**
 * Flatten the nested outline tree depth-first into a single ordered list,
 * preserving hierarchy via `depth`. Entries without a page target are kept (so
 * the structure is visible) but carry `pageIndex: -1` and should render as
 * non-clickable.
 */
export function flattenOutline(
  nodes: PdfBookmarkObject[] | undefined,
): OutlineItem[] {
  const items: OutlineItem[] = []

  function walk(list: PdfBookmarkObject[] | undefined, depth: number): void {
    if (!list) return
    for (const node of list) {
      items.push({
        title: node.title,
        pageIndex: resolvePageIndex(node),
        depth,
      })
      walk(node.children, depth + 1)
    }
  }

  walk(nodes, 0)
  return items
}

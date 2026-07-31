// Bridge between the EmbedPDF viewer (which owns the scroll/zoom capabilities
// inside the <EmbedPDF> provider) and the rest of the app (toolbar, panels,
// command palette) which live outside that provider.
//
// Like `lib/pdf.ts`, the heavy capability objects are intentionally kept out of
// Pinia's reactive state. A component rendered inside <EmbedPDF> registers them
// here; everything else calls the helpers below.

import type { ScrollCapability } from '@embedpdf/plugin-scroll'
import type { ZoomCapability } from '@embedpdf/plugin-zoom'
import type { ReadingPosition } from './bookmarks'

let scrollCapability: ScrollCapability | null = null
let zoomCapability: ZoomCapability | null = null

export function setScrollCapability(cap: ScrollCapability | null): void {
  scrollCapability = cap
}

export function setZoomCapability(cap: ZoomCapability | null): void {
  zoomCapability = cap
}

/**
 * Jump to a page. `pageIndex` is 0-based (engine/outline/search convention);
 * the scroll capability expects a 1-based page number, so we convert.
 */
export function jumpToPage(pageIndex: number, alignY?: number): void {
  if (!scrollCapability) return
  scrollCapability.scrollToPage({
    pageNumber: pageIndex + 1,
    alignY,
    behavior: 'smooth',
  })
}

/** Current 1-based page number, or 1 if no document is loaded. */
export function getCurrentPage(): number {
  return scrollCapability?.getCurrentPage() ?? 1
}

/** Current zoom scale factor (1 = 100%), or 1 if unavailable. */
export function getCurrentZoom(): number {
  return zoomCapability?.getState().currentZoomLevel ?? 1
}

export function zoomIn(): void {
  zoomCapability?.zoomIn()
}

export function zoomOut(): void {
  zoomCapability?.zoomOut()
}

/**
 * Compute the current reading position (0-based page + vertical fraction) from
 * the live scroll metrics, for auto-resume (ADR-0006). Returns null when no
 * scroll capability is available.
 */
export function getReadingPosition(): ReadingPosition | null {
  if (!scrollCapability) return null
  const metrics = scrollCapability.getMetrics()
  const layout = scrollCapability.getLayout()
  const pageIndex = metrics.currentPage - 1
  const item = layout.virtualItems.find((v) => v.index === pageIndex)
  if (!item || item.height <= 0) return { pageIndex, alignY: 0 }
  const within = metrics.scrollOffset.y - item.y
  const alignY = (within / item.height) * 100
  return {
    pageIndex,
    alignY: Math.min(100, Math.max(0, alignY)),
  }
}

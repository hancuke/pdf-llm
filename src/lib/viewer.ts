// Bridge between the EmbedPDF viewer (which owns the scroll/zoom capabilities
// inside the <EmbedPDF> provider) and the rest of the app (toolbar, panels,
// command palette) which live outside that provider.
//
// Like `lib/pdf.ts`, the heavy capability objects are intentionally kept out of
// Pinia's reactive state. A component rendered inside <EmbedPDF> registers them
// here; everything else calls the helpers below.

import type { ScrollCapability } from '@embedpdf/plugin-scroll'
import {
  ZoomMode,
  type ZoomCapability,
  type ZoomLevel as PluginZoomLevel,
} from '@embedpdf/plugin-zoom'
import type { ReadingPosition } from './bookmarks'

/**
 * The zoom levels the toolbar offers: either a scale factor (1 = 100%) or one
 * of the fit modes. Mirrors the plugin's `ZoomLevel`, but as plain strings so
 * the stores and components never have to import the plugin's enum.
 */
export type ZoomFitMode = 'automatic' | 'fit-page' | 'fit-width'
export type ZoomLevel = number | ZoomFitMode

const FIT_MODES: Record<ZoomFitMode, ZoomMode> = {
  automatic: ZoomMode.Automatic,
  'fit-page': ZoomMode.FitPage,
  'fit-width': ZoomMode.FitWidth,
}

/** Human-readable labels for each fit mode — single source of truth for the
 *  toolbar menu and the store's zoomLabel getter. */
export const ZOOM_MODE_LABELS: Record<ZoomFitMode, string> = {
  automatic: '自动',
  'fit-page': '适合页面',
  'fit-width': '适合宽度',
}

/** All presets offered by the toolbar's zoom dropdown. */
export interface ZoomPreset {
  level: ZoomLevel
  label: string
}
export const ZOOM_PRESETS: ZoomPreset[] = [
  { level: 'fit-width', label: ZOOM_MODE_LABELS['fit-width'] },
  { level: 'fit-page', label: ZOOM_MODE_LABELS['fit-page'] },
  { level: 'automatic', label: ZOOM_MODE_LABELS.automatic },
  { level: 0.5, label: '50%' },
  { level: 0.75, label: '75%' },
  { level: 1, label: '100%' },
  { level: 1.25, label: '125%' },
  { level: 1.5, label: '150%' },
  { level: 2, label: '200%' },
]

let scrollCapability: ScrollCapability | null = null
let zoomCapability: ZoomCapability | null = null
// The capabilities exist as soon as the plugins register — well before a
// document is open. Their un-scoped methods (`getState()`, `zoomIn()`, …) are
// shorthand for "the active document" and throw `No active document` when
// there isn't one, so every helper below goes through `forDocument(id)` and
// bails out while `documentId` is null.
let documentId: string | null = null

export function setScrollCapability(cap: ScrollCapability | null): void {
  scrollCapability = cap
}

export function setZoomCapability(cap: ZoomCapability | null): void {
  zoomCapability = cap
}

/** Registered by the viewer whenever the registry's active document changes. */
export function setActiveDocumentId(id: string | null): void {
  documentId = id
}

function scrollScope() {
  if (!scrollCapability || !documentId) return null
  return scrollCapability.forDocument(documentId)
}

function zoomScope() {
  if (!zoomCapability || !documentId) return null
  return zoomCapability.forDocument(documentId)
}

/**
 * Jump to a page. `pageIndex` is 0-based (engine/outline/search convention);
 * the scroll capability expects a 1-based page number, so we convert.
 */
export function jumpToPage(pageIndex: number, alignY?: number): void {
  scrollScope()?.scrollToPage({
    pageNumber: pageIndex + 1,
    alignY,
    behavior: 'smooth',
  })
}

/** Current 1-based page number, or 1 if no document is loaded. */
export function getCurrentPage(): number {
  return scrollScope()?.getCurrentPage() ?? 1
}

/** Current zoom scale factor (1 = 100%), or 1 if unavailable. */
export function getCurrentZoom(): number {
  return zoomScope()?.getState().currentZoomLevel ?? 1
}

export function zoomIn(): void {
  zoomScope()?.zoomIn()
}

export function zoomOut(): void {
  zoomScope()?.zoomOut()
}

/** Apply a zoom preset: a scale factor, or one of the fit modes. */
export function setZoomLevel(level: ZoomLevel): void {
  zoomScope()?.requestZoom(typeof level === 'number' ? level : FIT_MODES[level])
}

/** Translate a level reported by the zoom plugin into the plain-string form. */
export function toZoomLevel(level: PluginZoomLevel): ZoomLevel {
  if (typeof level === 'number') return level
  const mode = (Object.keys(FIT_MODES) as ZoomFitMode[]).find(
    (name) => FIT_MODES[name] === level,
  )
  return mode ?? 1
}

/**
 * The zoom level as requested (a scale factor, or the active fit mode) — as
 * opposed to {@link getCurrentZoom}, which is always the resolved scale.
 */
export function getZoomLevel(): ZoomLevel {
  const state = zoomScope()?.getState()
  return state ? toZoomLevel(state.zoomLevel) : 1
}

/**
 * Compute the current reading position (0-based page + vertical fraction) from
 * the live scroll metrics, for auto-resume (ADR-0006). Returns null when no
 * document is open.
 */
export function getReadingPosition(): ReadingPosition | null {
  const scope = scrollScope()
  if (!scope) return null
  const metrics = scope.getMetrics()
  const layout = scope.getLayout()
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

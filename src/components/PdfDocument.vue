<script setup lang="ts">
// Lives INSIDE <EmbedPDF>, so the EmbedPDF capability hooks below are valid
// (they use Vue inject and must run within the provider). Responsibilities:
//   1. opening the pending file bytes via the document-manager plugin,
//   2. rendering the pages (DocumentContent / Viewport / Scroller / Render /
//      Selection layers), using the registry-driven active document id,
//   3. wiring the EmbedPDF text-selection plugin to the reader store.
//
// Note: this component can be remounted by <EmbedPDF>. All durable state is
// therefore sourced from the registry (the activeDocumentId slot prop and the
// document-manager capability) rather than from local refs.

import { watch, onBeforeUnmount } from 'vue'
import {
  useDocumentManagerCapability,
  DocumentContent,
} from '@embedpdf/plugin-document-manager/vue'
import { useSelectionCapability } from '@embedpdf/plugin-selection/vue'
import { useScrollCapability } from '@embedpdf/plugin-scroll/vue'
import { useZoomCapability } from '@embedpdf/plugin-zoom/vue'
import { Viewport } from '@embedpdf/plugin-viewport/vue'
import PdfScroller from './PdfScroller.vue'
import { useReaderStore } from '../stores/reader'
import { useUiStore } from '../stores/ui'
import { useBookmarkStore } from '../stores/bookmarks'
import {
  setScrollCapability,
  setZoomCapability,
  getReadingPosition,
  jumpToPage,
} from '../lib/viewer'
import type { ScrollCapability } from '@embedpdf/plugin-scroll'
import type { ZoomCapability } from '@embedpdf/plugin-zoom'
import { ZoomMode } from '@embedpdf/plugin-zoom'

const props = defineProps<{ activeDocumentId: string | null }>()

const reader = useReaderStore()
const ui = useUiStore()
const bookmarks = useBookmarkStore()
const emit = defineEmits<{
  (e: 'selection', page: number, text: string, x: number, y: number): void
}>()

const { provides: docManager } = useDocumentManagerCapability()
const { provides: selection } = useSelectionCapability()
const { provides: scroll } = useScrollCapability()
const { provides: zoom } = useZoomCapability()

// --- Wire scroll + zoom capabilities into the app-wide bridge -------------
// Subscriptions are torn down on unmount and re-created if the capability
// changes, so remounts never double-subscribe.
let scrollUnsubs: Array<() => void> = []
let zoomUnsubs: Array<() => void> = []
let lastPositionSavedAt = 0

function wireScroll(cap: ScrollCapability): void {
  scrollUnsubs.forEach((u) => u())
  scrollUnsubs = []
  setScrollCapability(cap)
  // Keep the toolbar's current-page readout in sync (reactive).
  scrollUnsubs.push(
    cap.onPageChange((event) => ui.setCurrentPage(event.pageNumber)),
  )
  // Throttled auto-save of the reading position for resume-on-reopen (ADR-0006).
  scrollUnsubs.push(
    cap.onScroll(() => {
      const now = Date.now()
      if (now - lastPositionSavedAt < 800) return
      lastPositionSavedAt = now
      const pos = getReadingPosition()
      if (pos) bookmarks.setLastPosition(reader.fileName, pos)
    }),
  )
  // Restore the saved position once, on the first layout after load.
  scrollUnsubs.push(
    cap.onLayoutReady((event) => {
      if (!event.isInitial) return
      const saved = bookmarks.getLastPosition(reader.fileName)
      if (saved) jumpToPage(saved.pageIndex, saved.alignY)
    }),
  )
}

function wireZoom(cap: ZoomCapability): void {
  zoomUnsubs.forEach((u) => u())
  zoomUnsubs = []
  setZoomCapability(cap)
  ui.setZoom(cap.getState().currentZoomLevel)
  zoomUnsubs.push(
    cap.onZoomChange((event) => ui.setZoom(event.newZoom)),
  )
}

watch(scroll, (cap) => cap && wireScroll(cap), { immediate: true })
watch(zoom, (cap) => cap && wireZoom(cap), { immediate: true })

// --- Double-click / double-tap zoom toggle --------------------------------
// Pinch + Ctrl/⌘-wheel are handled by the built-in `useZoomGesture` inside
// PdfScroller (transform-preview, commit-on-end → smooth). Here we only add a
// double-click toggle between fit-width and a comfortable reading zoom. This is a
// single re-render, so it stays cheap.
const READ_ZOOM = 1.6

function onDblClickZoom(): void {
  const z = zoom.value
  if (!z || !props.activeDocumentId) return
  const cur = z.getState().currentZoomLevel
  const target = cur > 1.15 ? ZoomMode.FitWidth : READ_ZOOM
  z.forDocument(props.activeDocumentId).requestZoom(target)
}

// Tracks which document id we've already wired (selection mode + attach) so a
// remount doesn't redo it. Module-scoped so it survives component remounts.
let attachedId: string | null = null

// --- Open the pending file whenever a new one is staged --------------------
async function openPending(): Promise<void> {
  const dm = docManager.value
  if (!dm) return
  const bytes = reader.consumePendingBytes()
  if (!bytes) return

  const resp = await dm
    .openDocumentBuffer({
      buffer: bytes,
      name: reader.fileName || 'document.pdf',
      autoActivate: true,
    })
    .toPromise()
  // Register the doc as active so the registry (and EmbedPDF's activeDocumentId
  // slot prop) reflects it; the watcher below then wires selection + attaches.
  dm.setActiveDocument(resp.documentId)
}

watch([() => reader.documentId, docManager], () => {
  void openPending()
})

// --- Wire the active document: enable text selection + attach to store -----
watch(
  () => props.activeDocumentId,
  async (id) => {
    if (!id || id === attachedId) return
    const doc = docManager.value?.getActiveDocument()
    if (!doc) return
    attachedId = id
    // Enable native text selection on the default interaction mode. The
    // document id is passed explicitly because enableForMode otherwise
    // requires an active document to already be set.
    selection.value?.enableForMode('pointerMode', { enableSelection: true }, id)
    await reader.attachDocument(doc)
    // Load the embedded 目录 (Outline) for the left panel.
    await reader.loadOutline()
  },
  { immediate: true },
)

// --- Selection bridge -------------------------------------------------------
// The actual selection capture lives in PdfScroller (descendant of <Viewport>);
// it re-emits here so the viewer (PdfViewer) can surface the Action Sheet.
function onScrollerSelection(
  page: number,
  text: string,
  x: number,
  y: number,
): void {
  emit('selection', page, text, x, y)
}

onBeforeUnmount(() => {
  scrollUnsubs.forEach((u) => u())
  zoomUnsubs.forEach((u) => u())
  scrollUnsubs = []
  zoomUnsubs = []
  setScrollCapability(null)
  setZoomCapability(null)
})

defineExpose({
  clearSelection(): void {
    selection.value?.clear()
  },
})
</script>

<template>
  <div class="pdf-viewport" @dblclick="onDblClickZoom">
    <DocumentContent
      v-if="activeDocumentId"
      :document-id="activeDocumentId"
      v-slot="{ isLoaded }"
    >
      <Viewport v-if="isLoaded" :document-id="activeDocumentId">
        <PdfScroller
          :document-id="activeDocumentId"
          @selection="onScrollerSelection"
        />
      </Viewport>
    </DocumentContent>
  </div>
</template>

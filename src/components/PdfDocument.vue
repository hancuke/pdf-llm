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
import { usePanCapability } from '@embedpdf/plugin-pan/vue'
import { Viewport } from '@embedpdf/plugin-viewport/vue'
import PdfScroller from './PdfScroller.vue'
import { useReaderStore } from '../stores/reader'
import { useUiStore } from '../stores/ui'
import { useBookmarkStore } from '../stores/bookmarks'
import {
  setScrollCapability,
  setZoomCapability,
  setActiveDocumentId,
  getReadingPosition,
  jumpToPage,
} from '../lib/viewer'
import { isCoarsePointer } from '../lib/pointer'
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
const { provides: pan } = usePanCapability()

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

// Note: only the *event* hooks are wired here. A capability exists as soon as
// its plugin registers — long before a document is open — and its un-scoped
// state readers (`cap.getState()`) resolve through `getActiveDocumentId()`,
// which throws `No active document`. The initial zoom readout is therefore
// taken in the activeDocumentId watcher below, where a document is guaranteed.
function wireZoom(cap: ZoomCapability): void {
  zoomUnsubs.forEach((u) => u())
  zoomUnsubs = []
  setZoomCapability(cap)
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
  // On touch devices a double-tap synthesises `dblclick`, which the selection
  // plugin maps to word-select — the gesture the long-press arbiter relies on.
  // Zoom stays on pinch there so the two don't fight over the same tap.
  if (isCoarsePointer()) return
  const scope = z.forDocument(props.activeDocumentId)
  const cur = scope.getState().currentZoomLevel
  scope.requestZoom(cur > 1.15 ? ZoomMode.FitWidth : READ_ZOOM)
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
    // Everything outside the provider (toolbar, palette, panels) reaches the
    // viewer through lib/viewer, which needs the id to scope its calls.
    setActiveDocumentId(id)
    if (!id || id === attachedId) return
    const doc = docManager.value?.getActiveDocument()
    if (!doc) return
    attachedId = id

    // Selection is already enabled for `pointerMode` by the plugin itself when
    // the document loads (with marquee + rect display); re-declaring it here
    // would replace that config wholesale. What we do need is to keep it alive
    // in `panMode`, which is the default mode on touch devices — the selection
    // handler is pointer-driven and mode-gated only by this flag, so enabling
    // it lets the long-press arbiter in PdfScroller drive a real selection.
    selection.value?.enableForMode(
      'panMode',
      { enableSelection: true, showSelectionRects: true, enableMarquee: false },
      id,
    )
    // `pointerMode` (the built-in default) does not declare `wantsRawTouch`,
    // so the interaction manager defaults it to true and sets
    // `touch-action: none` on every page — which is why a swipe over the page
    // never scrolled. `panMode` declares `wantsRawTouch: false`, restoring
    // native scrolling. Only on touch-primary devices: a mouse should keep
    // drag-to-select.
    if (isCoarsePointer()) pan.value?.makePanDefault()

    ui.setZoom(zoom.value?.forDocument(id).getState().currentZoomLevel ?? 1)
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
  setActiveDocumentId(null)
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

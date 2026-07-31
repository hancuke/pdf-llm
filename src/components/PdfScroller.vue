<script setup lang="ts">
// Renders the scrollable page list *inside* <Viewport>. Two responsibilities:
//   1. Wires the built-in smooth zoom gesture (pinch + Ctrl/⌘-wheel) via
//      `useZoomGesture`. During a gesture it only applies a CSS transform to the
//      already-rendered pages (GPU-composited, free) and commits the expensive
//      re-render once at gesture end — this is what makes zoom feel fluid, and is
//      the same technique the reference EmbedPDF demo uses.
//   2. Bridges EmbedPDF's text-selection plugin to the parent so a Selection can
//      be surfaced. Must live as a descendant of <Viewport> (which provides the
//      "viewport-element" the gesture hook attaches to).
import { watch, onBeforeUnmount } from 'vue'
import { useSelectionCapability } from '@embedpdf/plugin-selection/vue'
import { useZoomGesture } from '@embedpdf/plugin-zoom/vue'
import { Scroller } from '@embedpdf/plugin-scroll/vue'
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue'
import { RenderLayer } from '@embedpdf/plugin-render/vue'
import { TilingLayer } from '@embedpdf/plugin-tiling/vue'
import { SelectionLayer } from '@embedpdf/plugin-selection/vue'
import { attachLongPressSelect } from '../lib/longPressSelect'

const props = defineProps<{ documentId: string }>()
const emit = defineEmits<{
  (e: 'selection', page: number, text: string, x: number, y: number): void
}>()

const { elementRef } = useZoomGesture(() => props.documentId)

const { provides: selection } = useSelectionCapability()

let unsubscribeEnd: (() => void) | null = null
const lastPointer = { x: 0, y: 0 }

function setupSelection(): void {
  const sel = selection.value
  if (!sel) return
  if (unsubscribeEnd) unsubscribeEnd()
  unsubscribeEnd = sel.onEndSelection(async () => {
    const lines = await sel.getSelectedText().toPromise()
    const text = lines.join('\n').trim()
    if (!text) return
    const formatted = sel.getFormattedSelection()
    const pageIndex = formatted[0]?.pageIndex ?? 0
    emit('selection', pageIndex + 1, text, lastPointer.x, lastPointer.y)
  })
}

watch(selection, setupSelection, { immediate: true })

// `pointerup` rather than `mouseup`: a touch selection ends with a pointer
// event, and the compatibility mouse events are unreliable after a long press.
function onPointerUp(e: PointerEvent): void {
  lastPointer.x = e.clientX
  lastPointer.y = e.clientY
}

// Touch arbiter: swipe scrolls, long-press selects. See lib/longPressSelect.
let detachLongPress: (() => void) | null = null
// During a pinch the first finger still moves, which would otherwise drive the
// selection plugin's drag-select. Toggle `enableSelection` off for the pinch
// and back on afterwards. Reusing the exact panMode config keeps an existing
// highlight (showSelectionRects) visible while zooming.
const SELECTION_MODE = {
  enableSelection: true,
  showSelectionRects: true,
  enableMarquee: false,
} as const
watch(elementRef, (el) => {
  detachLongPress?.()
  detachLongPress = el
    ? attachLongPressSelect(el, {
        onPinchStart: () =>
          selection.value?.enableForMode(
            'panMode',
            { ...SELECTION_MODE, enableSelection: false },
            props.documentId,
          ),
        onPinchEnd: () =>
          selection.value?.enableForMode('panMode', SELECTION_MODE, props.documentId),
      })
    : null
})

onBeforeUnmount(() => {
  unsubscribeEnd?.()
  detachLongPress?.()
})
</script>

<template>
  <div ref="elementRef" class="zoom-transform" @pointerup="onPointerUp">
    <Scroller :document-id="documentId">
      <template #default="{ page }">
        <PagePointerProvider
          :document-id="documentId"
          :page-index="page.pageIndex"
        >
          <div class="pdf-page" :data-page="page.pageNumber + 1">
            <!-- Fixed `scale`: left unset, RenderLayer re-renders the whole
                 page at the live zoom × dpr, and the bitmap grows without
                 bound until the tab is killed. Pinned, it is a cheap
                 CSS-upscaled base that TilingLayer sharpens with
                 viewport-sized tiles. -->
            <RenderLayer
              :document-id="documentId"
              :page-index="page.pageIndex"
              :scale="0.5"
            />
            <TilingLayer :document-id="documentId" :page-index="page.pageIndex" />
            <SelectionLayer :document-id="documentId" :page-index="page.pageIndex" />
          </div>
        </PagePointerProvider>
      </template>
    </Scroller>
  </div>
</template>

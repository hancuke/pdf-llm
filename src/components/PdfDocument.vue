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
import { Viewport } from '@embedpdf/plugin-viewport/vue'
import { Scroller } from '@embedpdf/plugin-scroll/vue'
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue'
import { RenderLayer } from '@embedpdf/plugin-render/vue'
import { SelectionLayer } from '@embedpdf/plugin-selection/vue'
import { useReaderStore } from '../stores/reader'

const props = defineProps<{ activeDocumentId: string | null }>()

const reader = useReaderStore()
const emit = defineEmits<{
  (e: 'selection', page: number, text: string, x: number, y: number): void
}>()

const { provides: docManager } = useDocumentManagerCapability()
const { provides: selection } = useSelectionCapability()

// Tracks which document id we've already wired (selection mode + attach) so a
// remount doesn't redo it. Module-scoped so it survives component remounts.
let attachedId: string | null = null

const lastPointer = { x: 0, y: 0 }

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
  },
  { immediate: true },
)

// --- Selection wiring -------------------------------------------------------
let unsubscribeEnd: (() => void) | null = null

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

function onViewportMouseUp(e: MouseEvent): void {
  lastPointer.x = e.clientX
  lastPointer.y = e.clientY
}

onBeforeUnmount(() => {
  unsubscribeEnd?.()
})

defineExpose({
  clearSelection(): void {
    selection.value?.clear()
  },
})
</script>

<template>
  <div class="pdf-viewport" @mouseup="onViewportMouseUp">
    <DocumentContent
      v-if="activeDocumentId"
      :document-id="activeDocumentId"
      v-slot="{ isLoaded }"
    >
      <Viewport v-if="isLoaded" :document-id="activeDocumentId">
        <Scroller :document-id="activeDocumentId">
          <template #default="{ page }">
            <PagePointerProvider
              :document-id="activeDocumentId"
              :page-index="page.pageIndex"
            >
              <div class="pdf-page" :data-page="page.pageNumber + 1">
                <RenderLayer :document-id="activeDocumentId" :page-index="page.pageIndex" />
                <SelectionLayer :document-id="activeDocumentId" :page-index="page.pageIndex" />
              </div>
            </PagePointerProvider>
          </template>
        </Scroller>
      </Viewport>
    </DocumentContent>
  </div>
</template>

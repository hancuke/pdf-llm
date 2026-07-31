<script setup lang="ts">
import { ref, reactive, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { usePdfiumEngine } from '@embedpdf/engines/vue'
import { EmbedPDF } from '@embedpdf/core/vue'
import { createPluginRegistration } from '@embedpdf/core'
import { DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager'
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager'
import { ViewportPluginPackage } from '@embedpdf/plugin-viewport'
import { ScrollPluginPackage } from '@embedpdf/plugin-scroll'
import { RenderPluginPackage } from '@embedpdf/plugin-render'
import { TilingPluginPackage } from '@embedpdf/plugin-tiling'
import { SelectionPluginPackage } from '@embedpdf/plugin-selection'
import { ZoomPluginPackage } from '@embedpdf/plugin-zoom'
import { PanPluginPackage } from '@embedpdf/plugin-pan/vue'
import { wasmUrl, setEngine } from '../lib/pdf'
import type { PdfEngine } from '@embedpdf/models'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'
import { useConversationStore } from '../stores/conversation'
import { useUiStore } from '../stores/ui'
import PdfDocument from './PdfDocument.vue'
import ActionSheet from './ActionSheet.vue'
import type { Action } from '../lib/actions'

const reader = useReaderStore()
const settings = useSettingsStore()
const conversation = useConversationStore()
const ui = useUiStore()
const { hasDocument, scannedWarning } = storeToRefs(reader)

const pdfDoc = ref<InstanceType<typeof PdfDocument> | null>(null)

// --- Engine bootstrap (PDFium WASM) ----------------------------------------
const { engine } = usePdfiumEngine({ wasmUrl, fontFallback: null, worker: false })
const readyEngine = ref<PdfEngine | null>(null)
watch(
  engine,
  (e) => {
    setEngine(e)
    readyEngine.value = e
  },
  { immediate: true },
)

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  // RenderLayer draws one bitmap for the *whole* page; left unpinned it scales
  // with the zoom level (scale × dpr), which blows past a phone's memory budget
  // a few zoom steps in and kills the tab. The tiling plugin renders only the
  // tiles currently on screen, so bitmap memory is bounded by the viewport
  // instead of by page area × zoom². PdfScroller pins RenderLayer to a fixed
  // low-res base and layers the tiles on top (the official viewer composition).
  createPluginRegistration(TilingPluginPackage, {
    tileSize: 768,
    overlapPx: 2.5,
    extraRings: 0,
  }),
  createPluginRegistration(SelectionPluginPackage),
  createPluginRegistration(ZoomPluginPackage),
  // `panMode` is the only built-in mode declared with `wantsRawTouch: false`,
  // which is what stops the interaction manager from stamping
  // `touch-action: none` onto every page element. PdfDocument makes it the
  // default mode on touch devices so a swipe scrolls natively.
  // `defaultMode: 'never'` because the bundled auto-switch keys off
  // `ontouchstart`, which also matches touch-capable laptops; we gate on
  // `(pointer: coarse)` instead.
  createPluginRegistration(PanPluginPackage, { defaultMode: 'never' }),
]

// --- Action sheet ----------------------------------------------------------
interface SheetState {
  visible: boolean
  x: number
  y: number
  originX: number
  placement: 'above' | 'below'
}
const sheet = reactive<SheetState>({
  visible: false,
  x: 0,
  y: 0,
  originX: 0,
  placement: 'above',
})

function hideSheet(): void {
  sheet.visible = false
  pdfDoc.value?.clearSelection()
}

function showSheetAt(x: number, y: number): void {
  // x = desired horizontal centre of the selection, y = selection top (viewport
  // px). Position the sheet above the selection by default, flipping below when
  // it would overflow the top, and clamp inside the viewport so the action
  // buttons are always reachable. `originX`/`placement` drive the pointer-arrow.
  sheet.originX = x
  sheet.x = Math.max(8, Math.min(x, window.innerWidth - 8))
  sheet.y = Math.max(8, y)
  sheet.visible = true
  void nextTick().then(() => {
    const el = document.querySelector('.action-sheet') as HTMLElement | null
    if (!el) return
    const h = el.offsetHeight
    const w = el.offsetWidth
    let top = y - h - 8 // above the selection
    let placement: 'above' | 'below' = 'above'
    if (top < 8) {
      // not enough room above → place below the selection
      top = y + 8
      placement = 'below'
    }
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8))
    const left = Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8))
    sheet.placement = placement
    sheet.y = top
    sheet.x = left
  })
}

async function onSelection(page: number, text: string, x: number, y: number) {
  await reader.selectFromText(page, text)
  if (!reader.currentSelection) {
    hideSheet()
    return
  }
  showSheetAt(x, y - 8)
}

function onDocumentMouseDown(event: MouseEvent) {
  // Click outside the action sheet dismisses it (story 21).
  const target = event.target as HTMLElement
  if (target.closest('.action-sheet')) return
  if (reader.currentSelection && !sheet.visible) return
  hideSheet()
}

async function onPickAction(action: Action) {
  const selection = reader.currentSelection
  hideSheet()
  if (!selection) return
  await conversation.start(
    action,
    selection.contextText,
    selection.selectedText,
    reader.documentTitle,
  )
  // The conversation panel may be hidden (reading mode); reveal it so the
  // result is visible. Only open if currently hidden (Phase 2 decision:
  // hide = reading mode, not "off") — never hide an already-visible panel.
  if (!ui.conversationOpen) ui.toggleConversation()
}
</script>

<template>
  <section class="pdf-viewer" @mousedown="onDocumentMouseDown">
    <div v-if="reader.isLoading" class="pdf-loading">
      <div class="spinner" />
      <span>正在打开文档…</span>
    </div>
    <div v-if="scannedWarning" class="scanned-warning">
      该 PDF 没有可提取的文本层（可能是扫描件 / 图片 PDF），本应用不支持选中与解释。
    </div>

    <div v-if="!hasDocument" class="empty-state">
      <p class="empty-title">打开一个本地 PDF 开始阅读</p>
      <p class="empty-hint">拖拽文件到此处，或点击下方按钮选择</p>
      <label class="file-button">
        选择 PDF
        <input
          type="file"
          accept="application/pdf"
          class="hidden"
          @change="(e) => {
            const f = (e.target as HTMLInputElement).files?.[0]
            if (f) reader.loadFile(f)
          }"
        />
      </label>
      <p class="privacy-note">文档仅在你的浏览器中处理，不会上传到任何服务器。</p>
    </div>

    <EmbedPDF
      v-if="readyEngine"
      :engine="readyEngine!"
      :plugins="plugins"
      v-slot="{ activeDocumentId }"
    >
      <PdfDocument
        ref="pdfDoc"
        :active-document-id="activeDocumentId"
        @selection="onSelection"
      />
    </EmbedPDF>

    <ActionSheet
      v-if="sheet.visible && reader.currentSelection"
      :actions="settings.allActions"
      :selected-text="reader.currentSelection.selectedText"
      :x="sheet.x"
      :y="sheet.y"
      :origin-x="sheet.originX"
      :placement="sheet.placement"
      @pick="onPickAction"
      @close="hideSheet"
    />
  </section>
</template>

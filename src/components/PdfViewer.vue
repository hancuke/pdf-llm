<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { pdfjsLib } from '../lib/pdf'
import { TextLayer } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'
import { useConversationStore } from '../stores/conversation'
import ActionSheet from './ActionSheet.vue'
import type { Action } from '../lib/actions'

const reader = useReaderStore()
const settings = useSettingsStore()
const conversation = useConversationStore()

const pagesEl = ref<HTMLElement | null>(null)

interface SheetState {
  visible: boolean
  x: number
  y: number
}
const sheet = reactive<SheetState>({ visible: false, x: 0, y: 0 })

const { hasDocument, scannedWarning } = storeToRefs(reader)

function clearPages() {
  if (pagesEl.value) pagesEl.value.innerHTML = ''
}

function computeScale(page: PDFPageProxy): number {
  const base = page.getViewport({ scale: 1 })
  const containerWidth = pagesEl.value?.clientWidth ?? 800
  const available = containerWidth - 32
  return Math.max(0.5, Math.min(available / base.width, 3))
}

async function renderPage(page: PDFPageProxy, scale: number) {
  const viewport = page.getViewport({ scale })
  const wrapper = document.createElement('div')
  wrapper.className = 'pdf-page'
  wrapper.dataset.page = String(page.pageNumber)
  wrapper.style.width = `${viewport.width}px`
  wrapper.style.height = `${viewport.height}px`

  // Render the canvas at device-pixel resolution so vector text stays crisp on
  // HiDPI / Retina displays. The backing store is scaled by devicePixelRatio,
  // while the CSS size stays at the logical viewport size; the text layer is
  // positioned against that same logical viewport so it stays aligned.
  const outputScale = Math.max(1, window.devicePixelRatio || 1)
  const scaledViewport = page.getViewport({ scale: scale * outputScale })

  const canvas = document.createElement('canvas')
  canvas.className = 'pdf-canvas'
  canvas.width = Math.floor(scaledViewport.width)
  canvas.height = Math.floor(scaledViewport.height)
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`
  const ctx = canvas.getContext('2d')
  if (ctx) {
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise
  }
  wrapper.appendChild(canvas)

  // Text layer (selectable).
  const textLayerDiv = document.createElement('div')
  textLayerDiv.className = 'pdf-text-layer'
  wrapper.appendChild(textLayerDiv)

  const textContent = await page.getTextContent()
  const textLayer = new TextLayer({
    textContentSource: textContent,
    container: textLayerDiv,
    viewport,
  })
  await textLayer.render()

  return wrapper
}

async function renderAll() {
  const doc = reader.pdfDocument
  if (!doc || !pagesEl.value) return
  clearPages()
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const scale = computeScale(page)
    const wrapper = await renderPage(page, scale)
    pagesEl.value.appendChild(wrapper)
  }
}

function hideSheet() {
  sheet.visible = false
}

function showSheetAt(x: number, y: number) {
  sheet.x = Math.max(8, Math.min(x, window.innerWidth - 220))
  sheet.y = Math.max(8, y)
  sheet.visible = true
}

function onMouseUp() {
  // Defer so the browser finalises the selection before we read it.
  setTimeout(handleSelection, 0)
}

async function handleSelection() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    hideSheet()
    return
  }
  const text = sel.toString()
  if (!text.trim()) {
    hideSheet()
    return
  }

  // Locate the page wrapper that owns the selection.
  let node: Node | null = sel.anchorNode
  let wrapper: HTMLElement | null = null
  while (node && node !== pagesEl.value) {
    if (node instanceof HTMLElement && node.dataset.page) {
      wrapper = node
      break
    }
    node = node.parentNode
  }
  if (!wrapper) {
    hideSheet()
    return
  }
  const page = Number(wrapper.dataset.page)

  // Resolve the Selection from the selected string (robust, whitespace-tolerant
  // match) rather than fragile DOM offset mapping.
  await reader.setSelectionFromText(page, text)

  // If the selection couldn't be resolved, do not show the Action Sheet.
  if (!reader.currentSelection) {
    hideSheet()
    return
  }

  const rect = sel.getRangeAt(0).getBoundingClientRect()
  showSheetAt(rect.left + rect.width / 2, rect.top - 8)
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
  window.getSelection()?.removeAllRanges()
  if (!selection) return
  await conversation.start(
    action,
    selection.contextText,
    selection.selectedText,
  )
}

onMounted(() => {
  if (reader.hasDocument) void renderAll()
  document.addEventListener('mouseup', onMouseUp)
  document.addEventListener('mousedown', onDocumentMouseDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mouseup', onMouseUp)
  document.removeEventListener('mousedown', onDocumentMouseDown)
})

// Re-render only when a new document is loaded (documentId changes), never on
// transient selection updates.
watch(
  () => reader.documentId,
  () => {
    if (reader.hasDocument) void renderAll()
  },
)
</script>

<template>
  <section class="pdf-viewer">
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

    <div v-show="hasDocument" ref="pagesEl" class="pages"></div>

    <ActionSheet
      v-if="sheet.visible && reader.currentSelection"
      :actions="settings.allActions"
      :x="sheet.x"
      :y="sheet.y"
      @pick="onPickAction"
      @close="hideSheet"
    />
  </section>
</template>

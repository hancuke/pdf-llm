<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { pdfjsLib } from '../lib/pdf'
import { buildPageText } from '../lib/page-text'
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

// Per-page metadata needed to map a DOM selection back to a character range in
// the page's raw text. Built during render, used on selection.
interface PageMeta {
  textDivs: HTMLElement[]
  items: { str: string; leadingBreak: 0 | 1 | 2 }[]
}
const pageMeta = new Map<number, PageMeta>()

interface SheetState {
  visible: boolean
  x: number
  y: number
}
const sheet = reactive<SheetState>({ visible: false, x: 0, y: 0 })

const { hasDocument, scannedWarning } = storeToRefs(reader)

function clearPages() {
  if (pagesEl.value) pagesEl.value.innerHTML = ''
  pageMeta.clear()
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

  const { items } = buildPageText(textContent)
  pageMeta.set(page.pageNumber, {
    textDivs: textLayer.textDivs as HTMLElement[],
    items,
  })

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

/** Absolute character offset of (node, offset) within a page's raw text. */
function offsetOf(
  node: Node,
  offset: number,
  wrapper: HTMLElement,
  meta: PageMeta,
): number | null {
  // Climb from the (text) node up to the per-item text div that pdf.js created
  // for it. The div is the element in meta.textDivs whose parent is the text
  // layer container — NOT the container or the page wrapper.
  let el: Node | null = node
  let divEl: HTMLElement | null = null
  while (el && el !== wrapper) {
    if (el instanceof HTMLElement && meta.textDivs.includes(el)) {
      divEl = el
      break
    }
    el = el.parentNode
  }
  if (!divEl) return null
  const divIndex = meta.textDivs.indexOf(divEl)
  if (divIndex === -1) return null

  let base = 0
  for (let j = 0; j < divIndex; j++) {
    base += meta.items[j].str.length + meta.items[j].leadingBreak
  }
  // pdf.js renders each item in a single text node, so offset maps directly.
  return base + offset
}

function selectionRangeInPage(
  wrapper: HTMLElement,
): { page: number; range: { start: number; end: number } } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const page = Number(wrapper.dataset.page)
  const meta = pageMeta.get(page)
  if (!meta) return null

  const range = sel.getRangeAt(0)
  const start = offsetOf(range.startContainer, range.startOffset, wrapper, meta)
  const end = offsetOf(range.endContainer, range.endOffset, wrapper, meta)
  if (start === null || end === null) return null
  return {
    page,
    range: { start: Math.min(start, end), end: Math.max(start, end) },
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

function handleSelection() {
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

  const located = selectionRangeInPage(wrapper)
  if (!located) {
    hideSheet()
    return
  }

  void reader.setSelectionFromRange(located.page, located.range)

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

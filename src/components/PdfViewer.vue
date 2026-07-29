<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { pdfjsLib } from '../lib/pdf'
import { TextLayer } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'
import { useConversationStore } from '../stores/conversation'
import { normalizeRect, type TextItemBox } from '../lib/selection'
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

  // Append before rendering so the text spans are laid out when we measure them
  // for geometric selection.
  pagesEl.value?.appendChild(wrapper)

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

  // Capture each text item's on-screen rectangle (wrapper-local CSS px) for
  // geometric region selection. Whitespace-only spans are skipped — they carry
  // no selection payload and pdf.js stretches trailing-space spans across a
  // line, which would otherwise corrupt line-end selection.
  const wrapperRect = wrapper.getBoundingClientRect()
  const boxes: TextItemBox[] = []
  for (const div of textLayer.textDivs) {
    const str = div.textContent ?? ''
    if (!str.trim()) continue
    const r = div.getBoundingClientRect()
    boxes.push({
      str,
      x: r.left - wrapperRect.left,
      y: r.top - wrapperRect.top,
      w: r.width,
      h: r.height,
    })
  }
  reader.setPageBoxes(page.pageNumber, boxes)

  return wrapper
}

async function renderAll() {
  const doc = reader.pdfDocument
  if (!doc || !pagesEl.value) return
  clearPages()
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const scale = computeScale(page)
    await renderPage(page, scale)
  }
}

function hideSheet() {
  sheet.visible = false
  clearHighlights()
}

function showSheetAt(x: number, y: number) {
  // x = desired horizontal centre, y = selection top (viewport px). Position
  // the sheet above the selection by default; flip below when it would overflow
  // the top, and clamp inside the viewport so the action buttons are always
  // reachable.
  sheet.x = Math.max(8, Math.min(x, window.innerWidth - 8))
  sheet.y = Math.max(8, y)
  sheet.visible = true
  void nextTick().then(() => {
    const el = document.querySelector('.action-sheet') as HTMLElement | null
    if (!el) return
    const h = el.offsetHeight
    const w = el.offsetWidth
    let top = y - h - 8 // above the selection
    if (top < 8) top = y + 8 // not enough room above → below the selection
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8))
    const left = Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8))
    sheet.y = top
    sheet.x = left
  })
}

// --- Geometric region selection -------------------------------------------------

interface DragState {
  page: number
  wrapper: HTMLElement
  startX: number
  startY: number
  moved: boolean
  rectEl: HTMLElement | null
}

let drag: DragState | null = null

function localPoint(wrapper: HTMLElement, clientX: number, clientY: number) {
  const r = wrapper.getBoundingClientRect()
  return { x: clientX - r.left, y: clientY - r.top }
}

function clearHighlights() {
  pagesEl.value?.querySelectorAll('.pdf-highlight').forEach((el) => el.remove())
}

function drawHighlights(wrapper: HTMLElement, rects: TextItemBox[]) {
  clearHighlights()
  let container = wrapper.querySelector('.pdf-highlights') as HTMLElement | null
  if (!container) {
    container = document.createElement('div')
    container.className = 'pdf-highlights'
    wrapper.appendChild(container)
  }
  for (const rect of rects) {
    const el = document.createElement('div')
    el.className = 'pdf-highlight'
    el.style.left = `${rect.x}px`
    el.style.top = `${rect.y}px`
    el.style.width = `${rect.w}px`
    el.style.height = `${rect.h}px`
    container.appendChild(el)
  }
}

function onPagesMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  const target = e.target as HTMLElement
  const wrapper = target.closest('.pdf-page') as HTMLElement | null
  if (!wrapper || !wrapper.dataset.page) return
  drag = {
    page: Number(wrapper.dataset.page),
    wrapper,
    startX: e.clientX,
    startY: e.clientY,
    moved: false,
    rectEl: null,
  }
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
}

function onWindowMouseMove(e: MouseEvent) {
  if (!drag) return
  const dx = e.clientX - drag.startX
  const dy = e.clientY - drag.startY
  if (!drag.moved && Math.hypot(dx, dy) > 5) {
    drag.moved = true
    drag.wrapper.classList.add('selecting')
    const rectEl = document.createElement('div')
    rectEl.className = 'pdf-drag-rect'
    drag.wrapper.appendChild(rectEl)
    drag.rectEl = rectEl
  }
  if (drag.moved && drag.rectEl) {
    const start = localPoint(drag.wrapper, drag.startX, drag.startY)
    const cur = localPoint(drag.wrapper, e.clientX, e.clientY)
    drag.rectEl.style.left = `${Math.min(start.x, cur.x)}px`
    drag.rectEl.style.top = `${Math.min(start.y, cur.y)}px`
    drag.rectEl.style.width = `${Math.abs(cur.x - start.x)}px`
    drag.rectEl.style.height = `${Math.abs(cur.y - start.y)}px`
  }
}

async function onWindowMouseUp(e: MouseEvent) {
  if (!drag) return
  const d = drag
  drag = null
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
  d.wrapper.classList.remove('selecting')
  if (d.rectEl) d.rectEl.remove()

  if (d.moved) {
    // Geometric region selection: prefer this over native selection because it
    // is immune to pdf.js's absolutely-positioned spans and line-end breaks.
    const start = localPoint(d.wrapper, d.startX, d.startY)
    const cur = localPoint(d.wrapper, e.clientX, e.clientY)
    const region = normalizeRect({
      x: start.x,
      y: start.y,
      w: cur.x - start.x,
      h: cur.y - start.y,
    })
    clearHighlights()
    const res = await reader.selectFromRect(d.page, region)
    if (!res) {
      hideSheet()
      return
    }
    drawHighlights(d.wrapper, res.rects)
    window.getSelection()?.removeAllRanges()
    const r = d.wrapper.getBoundingClientRect()
    showSheetAt(r.left + region.x + region.w / 2, r.top + region.y - 8)
  } else {
    // No drag (click / double-click): fall back to native selection so a
    // double-clicked word still works.
    await handleSelection()
  }
}

// --- Native selection fallback (double-click word selection) --------------------

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

  clearHighlights()
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
  pagesEl.value?.addEventListener('mousedown', onPagesMouseDown)
  document.addEventListener('mousedown', onDocumentMouseDown)
})

onBeforeUnmount(() => {
  pagesEl.value?.removeEventListener('mousedown', onPagesMouseDown)
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
      :selected-text="reader.currentSelection.selectedText"
      :x="sheet.x"
      :y="sheet.y"
      @pick="onPickAction"
      @close="hideSheet"
    />
  </section>
</template>

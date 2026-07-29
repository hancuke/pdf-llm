// Reader store — the current Document and its selection (CONTEXT.md: "文档" /
// "文本层" / "选中内容"). Holds only the loaded PDF's metadata and the active
// Selection; the heavy PDFDocumentProxy lives outside reactive state to avoid
// proxying pdf.js internals.

import { defineStore } from 'pinia'
import { pdfjsLib } from '../lib/pdf'
import { buildPageText } from '../lib/page-text'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { extractContext, findSelectionRange } from '../lib/context'
import {
  gatherSelection,
  type TextItemBox,
  type Rect,
  type GatheredSelection,
} from '../lib/selection'
import type { ExtractedContext } from '../lib/types'
import { useConversationStore } from './conversation'

/** A resolved Selection plus the page it came from. */
export type ActiveSelection = { page: number } & ExtractedContext

interface ReaderState {
  fileName: string
  numPages: number
  /** Increments on every successful load; used to trigger re-rendering. */
  documentId: number
  /** null until the first page has been inspected. */
  hasTextLayer: boolean | null
  scannedWarning: boolean
  currentSelection: ActiveSelection | null
  /** Per-page text-item rectangles (page-wrapper-local CSS px) for geometric selection. */
  pageBoxes: Record<number, TextItemBox[]>
}

// pdf.js document is intentionally kept out of Pinia's reactive state.
let pdfDocument: PDFDocumentProxy | null = null
const pageTextCache = new Map<number, string>()

export const useReaderStore = defineStore('reader', {
  state: (): ReaderState => ({
    fileName: '',
    numPages: 0,
    documentId: 0,
    hasTextLayer: null,
    scannedWarning: false,
    currentSelection: null,
    pageBoxes: {},
  }),

  getters: {
    hasDocument: (state) => state.numPages > 0,
    pdfDocument: () => pdfDocument,
  },

  actions: {
    async loadFile(file: File): Promise<void> {
      const data = await file.arrayBuffer()
      // Pass font/CMaps URLs per-document (the ESM module namespace is frozen,
      // so they cannot be set globally). Served locally via public/ (offline).
      const task = pdfjsLib.getDocument({
        data,
        standardFontDataUrl: '/standard_fonts/',
        cMapUrl: '/cmaps/',
        cMapPacked: true,
      })
      pdfDocument = await task.promise

      this.fileName = file.name
      this.numPages = pdfDocument.numPages
      this.documentId += 1
      this.currentSelection = null
      this.scannedWarning = false
      this.pageBoxes = {}

      // Inspect the first page to decide whether a text layer exists
      // (ADR-0002: scanned / image PDFs are unsupported).
      const firstPage = await pdfDocument.getPage(1)
      const content = await firstPage.getTextContent()
      const hasText = content.items.some(
        (item) => 'str' in item && item.str.trim().length > 0,
      )
      this.hasTextLayer = hasText
      this.scannedWarning = !hasText

      // Opening a new document clears the previous Conversation so context
      // from another doc cannot leak (story 22).
      pageTextCache.clear()
      useConversationStore().clear()
    },

    /** Raw text of a page, computed once and cached (used for Context). */
    async getPageText(pageNumber: number): Promise<string> {
      if (pageTextCache.has(pageNumber)) {
        return pageTextCache.get(pageNumber) as string
      }
      if (!pdfDocument) return ''
      const page = await pdfDocument.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = buildPageText(content).text
      pageTextCache.set(pageNumber, text)
      return text
    },

    /**
     * Store the text-item rectangles for a page, computed by the viewer after
     * the text layer is rendered. Required for geometric region selection.
     */
    setPageBoxes(page: number, boxes: TextItemBox[]): void {
      this.pageBoxes[page] = boxes
    },

    /**
     * Resolve and store the active Selection from the text the user actually
     * selected (as returned by the browser). The range is located within the
     * page's raw text via {@link findSelectionRange}, then the Context is
     * extracted. If the selection can't be mapped, the selection text itself is
     * still surfaced so the user can act on it.
     */
    async setSelectionFromText(
      page: number,
      selectedText: string,
    ): Promise<void> {
      await this.resolveSelection(page, selectedText)
    },

    /**
     * Shared resolution step: locate `selectedText` in the page's raw text,
     * extract the Context, and store the active Selection. Exposed so both the
     * native-selection path and the geometric-selection path can reuse it.
     */
    async resolveSelection(page: number, selectedText: string): Promise<void> {
      const rawText = await this.getPageText(page)
      const range = findSelectionRange(rawText, selectedText)

      if (!range) {
        const fallback = selectedText.trim()
        this.currentSelection = {
          page,
          selectedText: fallback,
          contextText: fallback,
        }
        return
      }

      const result = extractContext(rawText, range)
      if (result.selectedText.length === 0) {
        this.currentSelection = null
        return
      }
      this.currentSelection = { page, ...result }
    },

    /**
     * Geometric region selection: gather every text item whose box intersects
     * `region` (in page-wrapper-local CSS px) in reading order, then resolve a
     * Selection from the gathered text. Returns the gathered text and the list
     * of boxes (for drawing highlight overlays), or null when nothing intersects.
     */
    async selectFromRect(
      page: number,
      region: Rect,
    ): Promise<GatheredSelection | null> {
      const boxes = this.pageBoxes[page]
      if (!boxes) return null

      const gathered = gatherSelection(boxes, region)
      if (!gathered) return null

      await this.resolveSelection(page, gathered.text)
      if (!this.currentSelection) return null

      return gathered
    },

    clearSelection(): void {
      this.currentSelection = null
    },
  },
})

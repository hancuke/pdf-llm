// Reader store — the current Document and its selection (CONTEXT.md: "文档" /
// "文本层" / "选中内容"). Holds only the loaded PDF's metadata and the active
// Selection; the heavy PDFDocumentProxy lives outside reactive state to avoid
// proxying pdf.js internals.

import { defineStore } from 'pinia'
import { pdfjsLib } from '../lib/pdf'
import { buildPageText } from '../lib/page-text'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { extractContext } from '../lib/context'
import type { ExtractedContext, SelectionRange } from '../lib/types'
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
  }),

  getters: {
    hasDocument: (state) => state.numPages > 0,
    pdfDocument: () => pdfDocument,
  },

  actions: {
    async loadFile(file: File): Promise<void> {
      const data = await file.arrayBuffer()
      const task = pdfjsLib.getDocument({ data })
      pdfDocument = await task.promise

      this.fileName = file.name
      this.numPages = pdfDocument.numPages
      this.documentId += 1
      this.currentSelection = null
      this.scannedWarning = false

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
     * Resolve and store the active Selection from a character range within a
     * page's raw text. Delegates the domain rule to {@link extractContext}.
     */
    async setSelectionFromRange(
      page: number,
      range: SelectionRange,
    ): Promise<void> {
      const rawText = await this.getPageText(page)
      const result = extractContext(rawText, range)
      if (result.selectedText.length === 0) {
        this.currentSelection = null
        return
      }
      this.currentSelection = { page, ...result }
    },

    clearSelection(): void {
      this.currentSelection = null
    },
  },
})

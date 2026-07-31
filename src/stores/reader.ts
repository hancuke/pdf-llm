// Reader store — the current Document and its selection (CONTEXT.md: "文档" /
// "文本层" / "选中内容"). Holds only the loaded PDF's metadata and the active
// Selection; the heavy PDFium engine + document live outside reactive state
// (see lib/pdf.ts) to avoid proxying WASM-backed internals.

import { defineStore } from 'pinia'
import {
  getEngine,
  getActiveDocument,
  setActiveDocument,
} from '../lib/pdf'
import { buildPageText } from '../lib/page-text'
import type { PdfDocumentObject } from '@embedpdf/models'
import { extractContext, findSelectionRange } from '../lib/context'
import { cleanMetadataTitle, deriveTitleFromText } from '../lib/documentTitle'
import type { ExtractedContext } from '../lib/types'
import { flattenOutline, type OutlineItem } from '../lib/outline'
import { normalizeSearchResults, type SearchHit } from '../lib/search'
import { useConversationStore } from './conversation'

/** A resolved Selection plus the page it came from. */
export type ActiveSelection = { page: number } & ExtractedContext

interface ReaderState {
  fileName: string
  numPages: number
  /** Increments on every successful load; used to trigger re-opening. */
  documentId: number
  /** null until the first page has been inspected. */
  hasTextLayer: boolean | null
  scannedWarning: boolean
  /** True while a newly selected file is being opened/parsed. */
  isLoading: boolean
  /** Clean title (PDF metadata or first-page fallback); empty if undeterminable. */
  documentTitle: string
  currentSelection: ActiveSelection | null
  /** Flattened 目录 (Outline) entries for the open document. */
  outline: OutlineItem[]
  /** Current in-PDF search query. */
  searchQuery: string
  /** Normalized search hits for the current query. */
  searchResults: SearchHit[]
  /** True while a search is running. */
  searching: boolean
}

// The bytes of a pending file live outside reactive state until the viewer's
// EmbedPDF engine opens them.
let pendingBytes: ArrayBuffer | null = null
const pageTextCache = new Map<number, string>()

export const useReaderStore = defineStore('reader', {
  state: (): ReaderState => ({
    fileName: '',
    numPages: 0,
    documentId: 0,
    hasTextLayer: null,
    scannedWarning: false,
    currentSelection: null,
    isLoading: false,
    documentTitle: '',
    outline: [],
    searchQuery: '',
    searchResults: [],
    searching: false,
  }),

  getters: {
    hasDocument: (state) => state.numPages > 0,
  },

  actions: {
    /**
     * Store the file bytes and bump the document id. The actual PDFium open
     * happens in the viewer (which owns the engine) when it sees the id change.
     * Kept engine-free per the headless EmbedPDF design (ADR-0001 / ADR-0004).
     */
    async loadFile(file: File): Promise<void> {
      pendingBytes = await file.arrayBuffer()
      this.fileName = file.name
      this.documentId += 1
      this.currentSelection = null
      this.scannedWarning = false
      this.hasTextLayer = null
      this.numPages = 0
      this.documentTitle = ''
      this.isLoading = true
      this.outline = []
      this.searchQuery = ''
      this.searchResults = []
      this.searching = false
      pageTextCache.clear()
      setActiveDocument(null)
      // Opening a new document clears the previous Conversation so context
      // from another doc cannot leak (story 22).
      useConversationStore().clear()
    },

    /** Take the pending file bytes (consumed exactly once). */
    consumePendingBytes(): ArrayBuffer | null {
      const bytes = pendingBytes
      pendingBytes = null
      return bytes
    },

    /**
     * Wire an already-opened PDFium document into the store: record the page
     * count, cache the document, and detect scanned / image PDFs by checking
     * whether the first page yields any extractable text (ADR-0002).
     */
    async attachDocument(doc: PdfDocumentObject): Promise<void> {
      setActiveDocument(doc)
      this.numPages = doc.pageCount
      this.documentId = this.documentId // unchanged; bumped by loadFile
      const firstPageText = await this.getPageText(1)
      this.hasTextLayer = firstPageText.trim().length > 0
      this.scannedWarning = !this.hasTextLayer
      this.documentTitle = await this.resolveDocumentTitle(doc, firstPageText)
      this.isLoading = false
    },

    /**
     * Resolve the clean title: prefer the PDF metadata `title`, otherwise fall
     * back to the first meaningful line of the first page (CONTEXT.md:
     * "干净题目"). Failures (unsupported metadata) degrade to the fallback.
     */
    async resolveDocumentTitle(
      doc: PdfDocumentObject,
      firstPageText: string,
    ): Promise<string> {
      const engine = getEngine()
      if (engine) {
        try {
          const { title } = await engine.getMetadata(doc).toPromise()
          const clean = cleanMetadataTitle(title)
          if (clean) return clean
        } catch {
          // Metadata unavailable — fall through to the text heuristic.
        }
      }
      return deriveTitleFromText(firstPageText)
    },

    /** Raw text of a page, computed once and cached (used for Context). */
    async getPageText(pageNumber: number): Promise<string> {
      if (pageTextCache.has(pageNumber)) {
        return pageTextCache.get(pageNumber) as string
      }
      const engine = getEngine()
      const doc = getActiveDocument()
      if (!engine || !doc) return ''
      const raw = await engine.extractText(doc, [pageNumber - 1]).toPromise()
      const text = buildPageText(raw).text
      pageTextCache.set(pageNumber, text)
      return text
    },

    /**
     * Store the text the user selected (as returned by the EmbedPDF selection
     * plugin). The range is located within the page's raw text via
     * {@link findSelectionRange}, then the Context is extracted. If the
     * selection can't be mapped, the selection text itself is still surfaced.
     */
    async setSelectionFromText(
      page: number,
      selectedText: string,
    ): Promise<void> {
      await this.resolveSelection(page, selectedText)
    },

    /**
     * Alias used by the viewer: resolve and store a Selection from selected
     * text (1-based page number).
     */
    async selectFromText(page: number, selectedText: string): Promise<void> {
      await this.resolveSelection(page, selectedText)
    },

    /**
     * Shared resolution step: locate `selectedText` in the page's raw text,
     * extract the Context, and store the active Selection.
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

    clearSelection(): void {
      this.currentSelection = null
    },

    /**
     * Load the document's embedded 目录 (Outline) via the engine's bookmark API
     * and flatten it for the left panel. Failures (unsupported / missing
     * outline) degrade to an empty list.
     */
    async loadOutline(): Promise<void> {
      const engine = getEngine()
      const doc = getActiveDocument()
      if (!engine || !doc) {
        this.outline = []
        return
      }
      try {
        const { bookmarks } = await engine.getBookmarks(doc).toPromise()
        this.outline = flattenOutline(bookmarks)
      } catch {
        this.outline = []
      }
    },

    /** Run an in-PDF search and store normalized hits for the results panel. */
    async runSearch(query: string): Promise<void> {
      this.searchQuery = query
      const engine = getEngine()
      const doc = getActiveDocument()
      const trimmed = query.trim()
      if (!engine || !doc || !trimmed) {
        this.searchResults = []
        return
      }
      this.searching = true
      try {
        const result = await engine.searchAllPages(doc, trimmed).toPromise()
        this.searchResults = normalizeSearchResults(result.results)
      } catch {
        this.searchResults = []
      } finally {
        this.searching = false
      }
    },

    clearSearch(): void {
      this.searchQuery = ''
      this.searchResults = []
    },
  },
})

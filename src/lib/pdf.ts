// PDFium (EmbedPDF) engine bootstrap + non-reactive holders shared between the
// viewer (which creates the engine via usePdfiumEngine) and the reader store
// (which needs the engine + active document for text extraction).
//
// The heavy objects are intentionally kept out of Pinia's reactive state (same
// reasoning as the old pdf.js PdfDocumentProxy) to avoid proxying WASM-backed
// internals.

import type { PdfEngine, PdfDocumentObject } from '@embedpdf/models'

// PDFium WASM is self-hosted in /public (copied by scripts/copy-pdfassets.mjs
// before dev/build) so the app stays fully offline (ADR-0001).
export const wasmUrl = '/pdfium.wasm'

let engine: PdfEngine | null = null
let activeDocument: PdfDocumentObject | null = null

export function setEngine(e: PdfEngine | null): void {
  engine = e
}

export function getEngine(): PdfEngine | null {
  return engine
}

export function setActiveDocument(d: PdfDocumentObject | null): void {
  activeDocument = d
}

export function getActiveDocument(): PdfDocumentObject | null {
  return activeDocument
}

// Seam 1 unit tests for the reader store.
// Covers spec story 3 (loading error + retry + cancel), story 4 (non-PDF
// rejected with a toast, no loading), and the dismissible "no text layer"
// notice. Assertions target observable store state only.
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useReaderStore } from './reader'
import { useUiStore } from './ui'

/** Minimal File stand-in usable in the node test env (no global File). */
function fakeFile(type: string, name: string): File {
  return {
    type,
    name,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as File
}

describe('reader store — non-PDF rejection (story 4)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('rejects a non-PDF with a toast and never enters loading', async () => {
    const reader = useReaderStore()
    const ui = useUiStore()

    await reader.loadFile(fakeFile('text/plain', 'notes.txt'))

    expect(ui.toast).toBe('仅支持 PDF 文件')
    expect(reader.isLoading).toBe(false)
    expect(reader.loadError).toBeNull()
  })
})

describe('reader store — load lifecycle (story 3)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('stages a PDF and enters loading without an error', async () => {
    const reader = useReaderStore()
    const initialId = reader.documentId

    await reader.loadFile(fakeFile('application/pdf', 'doc.pdf'))

    expect(reader.isLoading).toBe(true)
    expect(reader.loadError).toBeNull()
    expect(reader.documentId).toBe(initialId + 1)
    expect(reader.fileName).toBe('doc.pdf')
  })

  it('surfaces a fatal load error and stops loading', () => {
    const reader = useReaderStore()
    reader.setLoadError('文件已损坏或已加密')

    expect(reader.loadError).toBe('文件已损坏或已加密')
    expect(reader.isLoading).toBe(false)
  })

  it('cancels an in-progress load', async () => {
    const reader = useReaderStore()
    await reader.loadFile(fakeFile('application/pdf', 'doc.pdf'))
    expect(reader.isLoading).toBe(true)

    reader.cancelLoad()

    expect(reader.isLoading).toBe(false)
    expect(reader.loadError).toBeNull()
  })

  it('retries a failed load by re-staging the last bytes', async () => {
    const reader = useReaderStore()
    await reader.loadFile(fakeFile('application/pdf', 'doc.pdf'))
    const afterStaging = reader.documentId

    reader.setLoadError('打开失败')
    expect(reader.loadError).toBe('打开失败')

    reader.retryLoad()

    expect(reader.loadError).toBeNull()
    expect(reader.isLoading).toBe(true)
    // documentId bumps again so the viewer re-opens
    expect(reader.documentId).toBe(afterStaging + 1)
  })
})

describe('reader store — scanned / no-text-layer notice', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('dismisses the informational scanned warning', () => {
    const reader = useReaderStore()
    reader.scannedWarning = true
    expect(reader.scannedWarning).toBe(true)

    reader.dismissScannedWarning()

    expect(reader.scannedWarning).toBe(false)
  })
})

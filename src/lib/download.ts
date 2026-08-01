// Shared browser download trigger (infrastructure: touches the DOM). Used by
// the read-aloud audio export and the conversation Markdown export so the
// anchor-click dance lives in exactly one place.

/**
 * Trigger a browser download of `blob` as `filename`. Creates a temporary
 * anchor, clicks it, then revokes the object URL on the next tick so the
 * download has time to start.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

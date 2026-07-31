// Clean-title derivation for a loaded PDF (CONTEXT.md: "干净题目").
// Framework-independent (no Pinia / DOM) so it stays testable and next to the
// other pure document-domain helpers.

export const MAX_TITLE_LENGTH = 120

/** Normalise a raw PDF metadata title; returns '' when absent. */
export function cleanMetadataTitle(raw: string | null): string {
  const title = (raw ?? '').trim()
  return title ? title.slice(0, MAX_TITLE_LENGTH) : ''
}

/**
 * Heuristic title fallback when PDF metadata has no title: the first
 * non-trivial line of the first page's text. Returns '' when nothing usable.
 */
export function deriveTitleFromText(firstPageText: string): string {
  for (const rawLine of firstPageText.split('\n')) {
    const line = rawLine.trim()
    if (line.length >= 4) return line.slice(0, MAX_TITLE_LENGTH)
  }
  return ''
}

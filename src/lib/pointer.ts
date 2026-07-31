/**
 * Is the primary pointing device coarse (a finger) rather than a mouse?
 *
 * Deliberately narrower than the `'ontouchstart' in window` check bundled with
 * EmbedPDF's pan plugin: that also matches touch-capable laptops, where the
 * mouse is still the primary input and drag-to-select should keep working.
 */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(pointer: coarse)').matches
}

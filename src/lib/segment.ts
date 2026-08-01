// Word segmentation for the read-aloud text view (CONTEXT.md: "词单元").
//
// Uses the browser-native `Intl.Segmenter` with `granularity: 'word'`, which
// splits both Latin script (on whitespace) and CJK (via the ICU dictionary)
// into word-like units — with zero dependencies and no backend, in line with
// ADR-0001. The read-aloud panel renders each segment; only `isWord` segments
// are clickable for phonetics / single-word pronunciation.

/** A single slice of text as produced by `segmentWords`. */
export interface WordSegment {
  /** The raw substring (may be a word, whitespace, or punctuation). */
  text: string
  /**
   * True when the slice is a word-like unit that should be clickable
   * (e.g. "hello", "读书"); false for spaces, punctuation, etc.
   */
  isWord: boolean
}

// One shared segmenter instance for the whole app.
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })

/**
 * Split `text` into word / non-word segments for the read-aloud text view.
 * Pure and framework-independent (clean architecture). For an empty string
 * returns an empty array.
 */
export function segmentWords(text: string): WordSegment[] {
  if (!text) return []
  const segments: WordSegment[] = []
  for (const part of segmenter.segment(text)) {
    // `isWordLike` is present on word-granularity segments.
    const isWord = (part as { isWordLike?: boolean }).isWordLike === true
    segments.push({ text: part.segment, isWord })
  }
  return segments
}

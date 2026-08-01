// Phonetics lookup for the read-aloud word view (CONTEXT.md: "单词音标").
//
// Per ADR-0011, English phonetics (IPA) come from an external free dictionary
// API rather than a bundled dictionary, to keep the bundle small. This is the
// one deliberate deviation from the ADR-0001 pure-client stance; results are
// cached per word so repeated clicks don't re-hit the network. Chinese phonetics
// are intentionally out of scope (see ADR-0011) — callers simply show no popover
// when this returns an empty list.

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en'

/** In-memory cache: lowercased word -> IPA strings (empty = known miss). */
const cache = new Map<string, string[]>()

/** Shape of a single dictionary API entry (only the bits we read). */
interface DictionaryEntry {
  phonetic?: string
  phonetics?: { text?: string; phonetic?: string }[]
}

/** Normalize a word for lookup + cache key (lowercase, trimmed). */
function normalize(word: string): string {
  return word.toLowerCase().trim()
}

/**
 * Fetch IPA phonetics for an English `word`. Returns an array of distinct
 * phonetic strings (often one, sometimes a few variants). On any failure —
 * network error, non-200, or an unrecognized word — returns an empty array so
 * the UI can simply show nothing. Results are cached per word.
 */
export async function fetchPhonetics(word: string): Promise<string[]> {
  const key = normalize(word)
  if (!key) return []

  const cached = cache.get(key)
  if (cached) return cached

  try {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(key)}`)
    if (!response.ok) {
      cache.set(key, [])
      return []
    }
    const data = (await response.json()) as DictionaryEntry[]
    const phonetics: string[] = []
    if (Array.isArray(data)) {
      for (const entry of data) {
        // dictionaryapi.dev returns each variant's IPA under `phonetics[].text`
        // (and a possible top-level `phonetic` on the entry).
        const candidates = [
          entry.phonetic,
          ...(entry.phonetics ?? []).map((p) => p.text ?? p.phonetic),
        ]
        for (const candidate of candidates) {
          if (candidate && !phonetics.includes(candidate)) phonetics.push(candidate)
        }
      }
    }
    cache.set(key, phonetics)
    return phonetics
  } catch {
    cache.set(key, [])
    return []
  }
}

/** Test/debug helper: clear the phonetic cache. */
export function clearPhoneticsCache(): void {
  cache.clear()
}

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchPhonetics, clearPhoneticsCache } from './phonetics'

/** Stub fetch returning a JSON body with the given status. */
function jsonFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }) as unknown as Response
  }) as unknown as typeof fetch
}

describe('fetchPhonetics', () => {
  beforeEach(() => {
    clearPhoneticsCache()
    vi.restoreAllMocks()
  })

  it('extracts distinct IPA strings from the dictionary response', async () => {
    globalThis.fetch = jsonFetch([
      {
        phonetic: '/həˈloʊ/',
        phonetics: [{ text: '/həˈloʊ/' }, { text: '/hɛˈloʊ/' }],
      },
    ])
    const result = await fetchPhonetics('hello')
    expect(result).toEqual(['/həˈloʊ/', '/hɛˈloʊ/'])
  })

  it('returns an empty array for an unrecognized word (404)', async () => {
    globalThis.fetch = jsonFetch({ title: 'Not found' }, 404)
    expect(await fetchPhonetics('zzzqqq')).toEqual([])
  })

  it('returns an empty array when the network throws', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await fetchPhonetics('hello')).toEqual([])
  })

  it('normalizes the word and caches the result (no second fetch)', async () => {
    const fetchMock = jsonFetch([{ phonetic: '/wɔːld/' }])
    globalThis.fetch = fetchMock
    expect(await fetchPhonetics('World')).toEqual(['/wɔːld/'])
    expect(await fetchPhonetics('world')).toEqual(['/wɔːld/'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns an empty array for blank input without fetching', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch
    globalThis.fetch = fetchMock
    expect(await fetchPhonetics('   ')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// Store-seam test for the 生词本 (vocab book) — verifies the user-visible
// behavior documented in spec-vocab-book.md: collect / remove / toggle,
// same-document de-duplication, and grouping by document title.

import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useVocabStore } from './vocab'
import type { CollectPayload } from './vocab'

function makePayload(overrides: Partial<CollectPayload> = {}): CollectPayload {
  return {
    word: 'attention',
    phonetics: 'əˈtenʃən',
    context: 'Attention is all you need.',
    documentTitle: 'Attention Is All You Need',
    fileName: 'a.pdf',
    pageIndex: 0,
    ...overrides,
  }
}

describe('vocab store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('collects a word and exposes it via grouped', () => {
    const vocab = useVocabStore()
    expect(vocab.count).toBe(0)

    vocab.collect(makePayload())
    expect(vocab.count).toBe(1)
    expect(vocab.isCollected('attention', 'a.pdf')).toBe(true)

    const groups = vocab.grouped
    expect(Object.keys(groups)).toEqual(['Attention Is All You Need'])
    expect(groups['Attention Is All You Need'][0].word).toBe('attention')
  })

  it('de-duplicates the same word within the same document', () => {
    const vocab = useVocabStore()
    vocab.collect(makePayload({ phonetics: 'old' }))
    vocab.collect(makePayload({ phonetics: 'new' }))

    expect(vocab.count).toBe(1)
    expect(vocab.grouped['Attention Is All You Need'][0].phonetics).toBe('new')
  })

  it('keeps different words, and the same word across different documents', () => {
    const vocab = useVocabStore()
    vocab.collect(makePayload({ word: 'transformer' })) // a.pdf
    vocab.collect(makePayload({ word: 'attention', fileName: 'b.pdf' })) // b.pdf
    vocab.collect(makePayload({ word: 'attention', fileName: 'a.pdf' })) // a.pdf again

    expect(vocab.count).toBe(3)
    expect(vocab.isCollected('attention', 'b.pdf')).toBe(true)
    expect(vocab.isCollected('attention', 'a.pdf')).toBe(true)
    expect(vocab.isCollected('transformer', 'a.pdf')).toBe(true)
  })

  it('toggle removes an already-collected word and re-adds it', () => {
    const vocab = useVocabStore()
    vocab.collect(makePayload())
    expect(vocab.isCollected('attention', 'a.pdf')).toBe(true)

    vocab.toggle(makePayload())
    expect(vocab.count).toBe(0)
    expect(vocab.isCollected('attention', 'a.pdf')).toBe(false)

    vocab.toggle(makePayload())
    expect(vocab.count).toBe(1)
  })

  it('remove drops an entry by id', () => {
    const vocab = useVocabStore()
    vocab.collect(makePayload())
    const id = vocab.entries[0].id

    vocab.remove(id)
    expect(vocab.count).toBe(0)
  })

  it('groups entries without a title under 未命名文档', () => {
    const vocab = useVocabStore()
    vocab.collect(makePayload({ documentTitle: '' }))
    expect(Object.keys(vocab.grouped)).toEqual(['未命名文档'])
  })
})

// Seam 1 unit tests for the bookmarks store.
// Covers spec story 26 (optional name/note on a bookmark, with a sensible page
// default) and the rename action. Position memory is coordinate-only
// (ADR-0006); these tests assert the store state, never document content.
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBookmarkStore } from './bookmarks'
import type { ReadingPosition } from '../lib/bookmarks'

const pos: ReadingPosition = { pageIndex: 2, alignY: 0.4 }

describe('bookmarks store — optional name (story 26)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults the label to the page when no name is given', () => {
    const bookmarks = useBookmarkStore()
    bookmarks.addBookmark('a.pdf', pos)

    const list = bookmarks.forDocument('a.pdf')
    expect(list).toHaveLength(1)
    // pageIndex is 0-based, label shows 1-based page
    expect(list[0].label).toBe('第 3 页')
  })

  it('uses the supplied name/note when provided', () => {
    const bookmarks = useBookmarkStore()
    bookmarks.addBookmark('a.pdf', pos, '重要结论')

    const list = bookmarks.forDocument('a.pdf')
    expect(list[0].label).toBe('重要结论')
  })

  it('trims and falls back to the page default for blank names', () => {
    const bookmarks = useBookmarkStore()
    bookmarks.addBookmark('a.pdf', pos, '   ')

    expect(bookmarks.forDocument('a.pdf')[0].label).toBe('第 3 页')
  })
})

describe('bookmarks store — rename + ordering', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renames a bookmark by id', () => {
    const bookmarks = useBookmarkStore()
    bookmarks.addBookmark('a.pdf', pos, '旧名')
    const id = bookmarks.forDocument('a.pdf')[0].id

    bookmarks.updateBookmarkLabel('a.pdf', id, '新名')
    expect(bookmarks.forDocument('a.pdf')[0].label).toBe('新名')
  })

  it('returns bookmarks newest-first', () => {
    const bookmarks = useBookmarkStore()
    // seed with explicit creation timestamps to isolate the sort from timing
    bookmarks.byDocument = {
      'a.pdf': [
        { id: 'old', pageIndex: 0, alignY: 0, label: '旧', createdAt: 100 },
        { id: 'mid', pageIndex: 1, alignY: 0, label: '中', createdAt: 200 },
        { id: 'new', pageIndex: 2, alignY: 0, label: '新', createdAt: 300 },
      ],
    }

    const list = bookmarks.forDocument('a.pdf')
    expect(list.map((b) => b.id)).toEqual(['new', 'mid', 'old'])
  })

  it('stores only coordinates, never document text', () => {
    const bookmarks = useBookmarkStore()
    bookmarks.addBookmark('a.pdf', pos, '备注')
    const stored = bookmarks.forDocument('a.pdf')[0]

    expect(stored.pageIndex).toBe(2)
    expect(stored.alignY).toBe(0.4)
    // tsc would reject any text-body field; assert the documented keys only
    expect(Object.keys(stored).sort()).toEqual(
      ['alignY', 'createdAt', 'id', 'label', 'pageIndex'].sort(),
    )
  })
})

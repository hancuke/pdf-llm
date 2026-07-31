import { describe, it, expect } from 'vitest'
import { flattenOutline } from './outline'
import type { PdfBookmarkObject } from '@embedpdf/models'

type Target = PdfBookmarkObject['target']

function bookmark(
  title: string,
  pageIndex: number | null,
  children?: PdfBookmarkObject[],
): PdfBookmarkObject {
  const target: Target =
    pageIndex === null
      ? undefined
      : ({
          type: 'destination',
          destination: { pageIndex },
        } as unknown as NonNullable<Target>)
  return { title, target, children } as PdfBookmarkObject
}

describe('flattenOutline', () => {
  it('flattens a nested bookmark tree preserving depth and order', () => {
    const tree = [
      bookmark('Chapter 1', 0, [
        bookmark('Section 1.1', 1),
        bookmark('Section 1.2', 2, [bookmark('Sub 1.2.1', 3)]),
      ]),
      bookmark('Chapter 2', 4),
    ]

    expect(flattenOutline(tree)).toEqual([
      { title: 'Chapter 1', pageIndex: 0, depth: 0 },
      { title: 'Section 1.1', pageIndex: 1, depth: 1 },
      { title: 'Section 1.2', pageIndex: 2, depth: 1 },
      { title: 'Sub 1.2.1', pageIndex: 3, depth: 2 },
      { title: 'Chapter 2', pageIndex: 4, depth: 0 },
    ])
  })

  it('marks entries without a resolvable page target as pageIndex -1', () => {
    expect(flattenOutline([bookmark('Go to next page', null)])).toEqual([
      { title: 'Go to next page', pageIndex: -1, depth: 0 },
    ])
  })

  it('returns an empty list for undefined bookmarks', () => {
    expect(flattenOutline(undefined)).toEqual([])
  })
})

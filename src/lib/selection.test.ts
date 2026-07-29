import { describe, it, expect } from 'vitest'
import { rectsIntersect, gatherSelection, type TextItemBox } from './selection'

describe('rectsIntersect', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 }
  it('detects overlap', () => {
    expect(rectsIntersect(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
  })
  it('detects adjacency as non-intersecting', () => {
    expect(rectsIntersect(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false)
  })
  it('detects separation', () => {
    expect(rectsIntersect(a, { x: 20, y: 20, w: 5, h: 5 })).toBe(false)
  })
})

describe('gatherSelection', () => {
  // Three lines of words laid out top-to-bottom. Each box is 10px tall and 20px
  // wide; lines are 30px apart in y.
  const boxes: TextItemBox[] = [
    { str: 'alpha', x: 0, y: 0, w: 20, h: 10 },
    { str: 'bravo', x: 25, y: 0, w: 20, h: 10 },
    { str: 'charlie', x: 0, y: 30, w: 20, h: 10 }, // line-end word of line 2
    { str: 'delta', x: 25, y: 30, w: 20, h: 10 },
    { str: 'echo', x: 0, y: 60, w: 20, h: 10 },
    { str: 'foxtrot', x: 25, y: 60, w: 20, h: 10 },
  ]

  it('returns null when the region hits nothing', () => {
    expect(gatherSelection(boxes, { x: 200, y: 200, w: 5, h: 5 })).toBeNull()
  })

  it('gathers a single word', () => {
    const res = gatherSelection(boxes, { x: 0, y: 0, w: 20, h: 10 })
    expect(res).not.toBeNull()
    expect(res!.text).toBe('alpha')
    expect(res!.rects).toHaveLength(1)
  })

  it('gathers words within one line in reading order', () => {
    const res = gatherSelection(boxes, { x: 0, y: 0, w: 60, h: 10 })
    expect(res!.text).toBe('alpha bravo')
  })

  it('gathers across a line boundary (line-end + next line) in order', () => {
    // Region covers the right of line 2 (charlie, at x 0..20? no) -> use a tall
    // rect that spans the end of line 2 and start of line 3.
    const res = gatherSelection(boxes, { x: 0, y: 25, w: 50, h: 40 })
    // Should capture charlie (line 2) and delta + echo? echo is on line 3 at y60
    // Region y 25..65 covers line 2 (y30) and line 3 (y60..70). x 0..50 covers all.
    expect(res!.text).toBe('charlie delta\necho foxtrot')
  })

  it('yields reading order even when input boxes are shuffled', () => {
    const shuffled = [boxes[5], boxes[0], boxes[3], boxes[2], boxes[4], boxes[1]]
    const res = gatherSelection(shuffled, { x: 0, y: 0, w: 60, h: 100 })
    expect(res!.text).toBe('alpha bravo\ncharlie delta\necho foxtrot')
  })
})

/**
 * Geometric text selection over a pdf.js text layer.
 *
 * pdf.js renders each word/run as its own absolutely-positioned <span>, so the
 * browser's native selection (which relies on geometric proximity between
 * spans) fails at line boundaries and across overlapping spans. Instead we treat
 * each text item as a rectangle on the page and, given a user-drawn selection
 * rectangle, gather every item that intersects it in reading order.
 */

export interface TextItemBox {
  /** The item's string (a word/run as rendered by pdf.js). */
  str: string
  /** Rectangle in page-wrapper-local CSS pixels, origin at top-left. */
  x: number
  y: number
  w: number
  h: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Axis-aligned bounding-box intersection (touching edges do not count). */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  const ax2 = a.x + a.w
  const ay2 = a.y + a.h
  const bx2 = b.x + b.w
  const by2 = b.y + b.h
  return a.x < bx2 && ax2 > b.x && a.y < by2 && ay2 > b.y
}

function normalize(r: Rect): Rect {
  return {
    x: Math.min(r.x, r.x + r.w),
    y: Math.min(r.y, r.y + r.h),
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  }
}

/** Normalise a possibly-negative-size rect (e.g. from a drag) to x/y/w/h >= 0. */
export function normalizeRect(r: Rect): Rect {
  return normalize(r)
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export interface GatheredSelection {
  /** Items in reading order, joined with spaces within a line and newlines between lines. */
  text: string
  /** The selected items in reading order (for drawing highlight overlays). */
  rects: TextItemBox[]
}

/** How far an item may overlap the current line's bottom before it starts a new line. */
const LINE_BREAK_TOLERANCE = 0.4

/**
 * Gather every text item whose box intersects `region`, ordered as a person
 * would read it (top-to-bottom lines, left-to-right within a line). Items are
 * grouped into lines by vertical proximity; within a line they are ordered by x.
 * Returns null when no item intersects the region.
 */
export function gatherSelection(
  boxes: TextItemBox[],
  region: Rect,
): GatheredSelection | null {
  const r = normalize(region)
  const selected = boxes.filter((b) => rectsIntersect(b, r))
  if (selected.length === 0) return null

  const lineH = median(selected.map((b) => b.h)) || 1
  // Stable sort by reading position: top first, then left.
  const ordered = [...selected].sort((a, b) => a.y - b.y || a.x - b.x)

  // Group consecutive items into lines. A new line starts when an item's top is
  // clearly below the current line's lowest bottom (allowing a little overlap so
  // ascenders/descenders don't split a line).
  const lines: TextItemBox[][] = []
  for (const box of ordered) {
    const last = lines[lines.length - 1]
    if (!last) {
      lines.push([box])
      continue
    }
    const lastBottom = Math.max(...last.map((b) => b.y + b.h))
    if (box.y > lastBottom - LINE_BREAK_TOLERANCE * lineH) lines.push([box])
    else last.push(box)
  }

  const rects = lines.flatMap((line) => [...line].sort((a, b) => a.x - b.x))
  const text = lines
    .map((line) => [...line].sort((a, b) => a.x - b.x).map((b) => b.str).join(' '))
    .join('\n')

  return { text, rects }
}

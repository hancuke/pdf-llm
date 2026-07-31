// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { attachLongPressSelect } from './longPressSelect'

// jsdom has no layout, so elementFromPoint returns null; the arbiter then
// falls back to `start.target`, which is the element the event was dispatched
// on — exactly what these tests exercise.
function touch(type: string, x: number, y: number): Event {
  const e = new Event(type, { bubbles: false, cancelable: true })
  if (type !== 'touchend' && type !== 'touchcancel') {
    ;(e as unknown as { touches: Array<{ clientX: number; clientY: number }> }).touches = [
      { clientX: x, clientY: y },
    ]
  } else {
    ;(e as unknown as { touches: unknown[] }).touches = []
  }
  return e
}

describe('attachLongPressSelect', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // jsdom does not implement layout, so elementFromPoint is absent; the
    // arbiter falls back to start.target when it returns null.
    ;(document as unknown as { elementFromPoint: () => null }).elementFromPoint = () => null
    // vitest's jsdom env does not expose MouseEvent as a global.
    if (typeof (globalThis as { MouseEvent?: unknown }).MouseEvent === 'undefined') {
      ;(globalThis as { MouseEvent: unknown }).MouseEvent = class extends Event {
        clientX: number
        clientY: number
        detail: number
        constructor(type: string, opts: EventInit & { clientX?: number; clientY?: number; detail?: number } = {}) {
          super(type, opts)
          this.clientX = opts.clientX ?? 0
          this.clientY = opts.clientY ?? 0
          this.detail = opts.detail ?? 0
        }
      }
    }
  })
  afterEach(() => vi.useRealTimers())

  it('dispatches a dblclick after HOLD_MS when the finger stays still (long-press selects)', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const detach = attachLongPressSelect(el)
    let dbl = 0
    el.addEventListener('dblclick', () => dbl++)
    el.dispatchEvent(touch('touchstart', 10, 10))
    vi.advanceTimersByTime(600)
    expect(dbl).toBe(1)
    detach()
    el.remove()
  })

  it('does NOT select when the finger moves before the hold expires (swipe scrolls)', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const detach = attachLongPressSelect(el)
    let dbl = 0
    el.addEventListener('dblclick', () => dbl++)
    el.dispatchEvent(touch('touchstart', 10, 10))
    vi.advanceTimersByTime(200)
    el.dispatchEvent(touch('touchmove', 30, 30)) // > MOVE_TOLERANCE_PX (8)
    vi.advanceTimersByTime(400)
    expect(dbl).toBe(0)
    detach()
    el.remove()
  })

  it('prevents default on touchmove once armed, so the browser does not scroll', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const detach = attachLongPressSelect(el)
    el.dispatchEvent(touch('touchstart', 10, 10))
    vi.advanceTimersByTime(600) // arm
    const mv = touch('touchmove', 15, 12)
    el.dispatchEvent(mv)
    expect(mv.defaultPrevented).toBe(true)
    detach()
    el.remove()
  })

  it('ignores two-finger touches (pinch belongs to zoom)', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const detach = attachLongPressSelect(el)
    let dbl = 0
    el.addEventListener('dblclick', () => dbl++)
    const e = new Event('touchstart', { cancelable: true })
    ;(e as unknown as { touches: Array<{ clientX: number; clientY: number }> }).touches = [
      { clientX: 10, clientY: 10 },
      { clientX: 20, clientY: 20 },
    ]
    el.dispatchEvent(e)
    vi.advanceTimersByTime(600)
    expect(dbl).toBe(0)
    detach()
    el.remove()
  })

  it('teardown removes all listeners', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const detach = attachLongPressSelect(el)
    detach()
    let dbl = 0
    el.addEventListener('dblclick', () => dbl++)
    el.dispatchEvent(touch('touchstart', 10, 10))
    vi.advanceTimersByTime(600)
    expect(dbl).toBe(0)
    el.remove()
  })
})

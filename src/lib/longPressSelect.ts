// Touch gesture arbiter: swipe = scroll, long-press = select.
//
// Background. EmbedPDF's interaction manager stamps `touch-action: none` onto
// every page element unless the active mode declares `wantsRawTouch: false`.
// With `panMode` active (see PdfDocument) that stamp is gone and a swipe
// scrolls natively again — but the same change means the browser now claims
// any touch drag as a scroll and fires `pointercancel`, so the selection
// plugin (which is pointer-driven and otherwise touch-agnostic) can never
// start a drag.
//
// Both gestures therefore have to share one finger, and something has to
// decide between them. That is this module:
//
//   • finger moves before the hold expires  → a swipe; we stay out of the way
//     and the browser scrolls.
//   • finger holds still for `HOLD_MS`      → a selection; from here on every
//     `touchmove` is `preventDefault`ed, so the browser never starts scrolling
//     and the pointer stream survives for the selection handler to consume.
//
// Once armed, selection itself is performed by EmbedPDF's OWN pointer handler
// (`text-selection.handler.ts`), which is already wired for `panMode` by
// PdfDocument: the `pointerdown` at the start of the touch recorded the glyph
// under the finger as the anchor, and each subsequent `pointermove` (which
// keeps firing because we suppressed the scroll) extends the selection. So a
// long-press followed by a drag selects text natively — no event synthesis
// required, which is exactly the "long-press to start, then drag to extend"
// behaviour common on mobile readers.
//
// As a convenience, a *stationary* long-press (the finger never drags) also
// selects the word under it by replaying the gesture the selection plugin maps
// to word-select (`dblclick` → `onDoubleClick` → `onWordSelect`). This is only
// done when no selection is already open: that path is unreliable while a
// selection overlay is already present, and if one is open the user is
// adjusting it by dragging anyway.

/** How long the finger must stay still before the gesture becomes a selection. */
const HOLD_MS = 500
/**
 * Movement that cancels the hold. Kept at/below the browsers' own touch slop
 * (~8px) so ordinary jitter neither cancels the hold nor lets a scroll start
 * behind our back.
 */
const MOVE_TOLERANCE_PX = 8

export interface LongPressSelectOptions {
  holdMs?: number
  moveTolerancePx?: number
  /** Called when the hold expires and the gesture becomes a selection. */
  onArm?: () => void
}

/** True when a selection (and its action sheet) is already on screen. */
function hasOpenSelection(): boolean {
  return !!document.querySelector('.action-sheet')
}

/**
 * Attach the arbiter to the element wrapping the pages. Returns a teardown.
 */
export function attachLongPressSelect(
  element: HTMLElement,
  options: LongPressSelectOptions = {},
): () => void {
  const holdMs = options.holdMs ?? HOLD_MS
  const tolerance = options.moveTolerancePx ?? MOVE_TOLERANCE_PX

  let timer: ReturnType<typeof setTimeout> | null = null
  let start: { x: number; y: number; target: EventTarget | null } | null = null
  let armed = false
  let swallowClick = false

  function disarm(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    start = null
    armed = false
  }

  function arm(): void {
    timer = null
    if (!start) return
    armed = true
    swallowClick = true
    options.onArm?.()
    // Stationary long-press: give the user an immediate word anchor to drag
    // from. Only when no selection is already open (see module note).
    if (!hasOpenSelection()) {
      // Dispatch on the deepest element at the press point — what a real touch
      // targets — never on a wrapper that the page's pointer-provider listener
      // would skip.
      const hit = document.elementFromPoint(start.x, start.y) ?? start.target
      hit?.dispatchEvent(
        new MouseEvent('dblclick', {
          bubbles: true,
          cancelable: true,
          detail: 2,
          clientX: start.x,
          clientY: start.y,
        }),
      )
    }
  }

  function onTouchStart(event: TouchEvent): void {
    disarm()
    // Two fingers is a pinch — that belongs to the zoom gesture.
    if (event.touches.length !== 1) return
    const touch = event.touches[0]
    start = { x: touch.clientX, y: touch.clientY, target: event.target }
    timer = setTimeout(arm, holdMs)
  }

  function onTouchMove(event: TouchEvent): void {
    if (armed) {
      // We've claimed this gesture as a selection: stop the browser from
      // scrolling so the pointer stream survives and the selection plugin's
      // own pointer-drag extends the selection.
      if (event.cancelable) event.preventDefault()
      return
    }
    if (!start || event.touches.length !== 1) return
    const touch = event.touches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.hypot(dx, dy) > tolerance) disarm()
  }

  function onTouchEnd(): void {
    disarm()
  }

  function onClickCapture(event: MouseEvent): void {
    if (!swallowClick) return
    swallowClick = false
    // Stop it in the capture phase so it never reaches the page's pointer
    // provider, where it would count as the third click of a triple-click.
    event.stopPropagation()
    event.preventDefault()
  }

  element.addEventListener('touchstart', onTouchStart, { passive: true })
  // Non-passive: this listener is the one allowed to cancel the scroll.
  element.addEventListener('touchmove', onTouchMove, { passive: false })
  element.addEventListener('touchend', onTouchEnd, { passive: true })
  element.addEventListener('touchcancel', onTouchEnd, { passive: true })
  element.addEventListener('click', onClickCapture, { capture: true })

  return () => {
    disarm()
    element.removeEventListener('touchstart', onTouchStart)
    element.removeEventListener('touchmove', onTouchMove)
    element.removeEventListener('touchend', onTouchEnd)
    element.removeEventListener('touchcancel', onTouchEnd)
    element.removeEventListener('click', onClickCapture, { capture: true })
  }
}

import { ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * Returns the top-center point (viewport px) of the central PDF pane so
 * floating overlays can anchor to the PDF area instead of the viewport.
 *
 * Recomputes on window resize and whenever the pane is resized (e.g. the side
 * panels open/close), which keeps the overlay inside the PDF area and clear of
 * the right-hand conversation panel.
 */
export function usePdfPaneAnchor(offsetTop = 12) {
  const top = ref(0)
  const left = ref(0)
  const paneWidth = ref(0)
  let observer: ResizeObserver | null = null

  function update() {
    const pane = document.querySelector<HTMLElement>('.pdf-pane')
    if (!pane) return
    const rect = pane.getBoundingClientRect()
    top.value = rect.top + offsetTop
    left.value = rect.left + rect.width / 2
    paneWidth.value = rect.width
  }

  onMounted(() => {
    update()
    window.addEventListener('resize', update)
    const pane = document.querySelector<HTMLElement>('.pdf-pane')
    if (pane && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update)
      observer.observe(pane)
    }
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', update)
    observer?.disconnect()
  })

  return { top, left, paneWidth }
}

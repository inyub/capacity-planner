import { useEffect, useRef, type RefObject } from 'react'

export function useBoardAutoScroll(
  board: RefObject<HTMLDivElement | null>,
  dragging: boolean
): RefObject<{ x: number; y: number } | null> {
  const pointer = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!dragging) return
    let frame: number
    let previous = performance.now()
    function track(event: PointerEvent): void {
      pointer.current = { x: event.clientX, y: event.clientY }
    }
    // Use the pointer and visible bounds, not the overlay's size or the source column.
    // Both axes may scroll in the same frame; only the column under the pointer scrolls vertically.
    function velocity(value: number, start: number, end: number): number {
      const edge = Math.min(56, (end - start) / 4)
      if (value < start || value > end) return 0
      if (value < start + edge) return -720 * (1 - (value - start) / edge)
      if (value > end - edge) return 720 * (1 - (end - value) / edge)
      return 0
    }
    function scroll(now: number): void {
      const seconds = Math.min(now - previous, 32) / 1000
      previous = now
      const element = board.current
      const point = pointer.current
      if (element && point) {
        const rect = element.getBoundingClientRect()
        if (point.y >= rect.top && point.y <= rect.bottom) {
          element.scrollLeft += velocity(point.x, rect.left, rect.right) * seconds
          for (const column of element.querySelectorAll<HTMLElement>('.month-cards')) {
            const bounds = column.getBoundingClientRect()
            if (
              point.x >= Math.max(rect.left, bounds.left) &&
              point.x <= Math.min(rect.right, bounds.right)
            ) {
              column.scrollTop += velocity(point.y, bounds.top, bounds.bottom) * seconds
              break
            }
          }
        }
      }
      frame = requestAnimationFrame(scroll)
    }
    document.addEventListener('pointermove', track, true)
    frame = requestAnimationFrame(scroll)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointermove', track, true)
      pointer.current = null
    }
  }, [board, dragging])
  return pointer
}

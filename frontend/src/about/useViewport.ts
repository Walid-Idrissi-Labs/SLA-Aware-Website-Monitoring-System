import { useCallback, useEffect, useRef, useState } from 'react'

export interface View {
  s: number
  x: number
  y: number
}

const MIN = 0.15
const MAX = 2.5

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Pan and zoom for a fixed-size canvas inside a resizable box. The view follows
 * the box's size (fitted) until the reader pans or zooms; Fit hands it back.
 * `start: 'height'` opens at the box's height from the left edge, for a narrow
 * box where the whole canvas would be too small to read.
 */
export function useViewport(width: number, height: number, start: 'fit' | 'height' = 'fit') {
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View | null>(null)
  const fitted = useRef(true)
  const opening = useRef(true)

  const fitView = useCallback((): View | null => {
    const el = ref.current
    if (!el || !el.clientWidth) return null
    const cw = el.clientWidth
    const ch = el.clientHeight
    if (opening.current && start === 'height') {
      const s = Math.min(1, ch / height)
      return { s, x: 0, y: (ch - height * s) / 2 }
    }
    const s = Math.min(cw / width, ch / height)
    return { s, x: (cw - width * s) / 2, y: (ch - height * s) / 2 }
  }, [width, height, start])

  const fit = useCallback(() => {
    fitted.current = true
    opening.current = false
    setView(fitView())
  }, [fitView])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (fitted.current) setView(fitView())
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fitView])

  /** Zoom by `factor`, keeping the point (px, py) of the box still; the box centre by default. */
  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    const el = ref.current
    if (!el) return
    fitted.current = false
    setView((v) => {
      if (!v) return v
      const cx = px ?? el.clientWidth / 2
      const cy = py ?? el.clientHeight / 2
      const s = clamp(v.s * factor, MIN, MAX)
      const k = s / v.s
      return { s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
    })
  }, [])

  const panBy = useCallback((dx: number, dy: number) => {
    fitted.current = false
    setView((v) => v && { ...v, x: v.x + dx, y: v.y + dy })
  }, [])

  return { ref, view, fit, zoomAt, panBy }
}

import { useEffect, useRef, type CSSProperties } from 'react'

/**
 * Ambient moving background. A few large, heavily-blurred colour blobs slowly
 * drift on their own (CSS keyframes) and gently lean toward the pointer, each
 * by a different depth so the parallax feels dimensional. Fixed behind all
 * content — the frosted `.panel` cards blur it live as it moves.
 *
 * Mounted once at the app root, so every route (auth + dashboard) shares it.
 */
export default function BackgroundFX() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Honour reduced-motion: the CSS drift is already frozen by the global
    // media query, so also skip pointer tracking and leave the halos still.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // Pointer target (tx, ty) and eased current (cx, cy), normalised to -1..1.
    let tx = 0
    let ty = 0
    let cx = 0
    let cy = 0
    let raf = 0

    const tick = () => {
      cx += (tx - cx) * 0.06
      cy += (ty - cy) * 0.06
      el.style.setProperty('--mx', cx.toFixed(4))
      el.style.setProperty('--my', cy.toFixed(4))
      // Keep easing until we've essentially caught up, then idle the loop.
      if (Math.abs(tx - cx) > 0.0004 || Math.abs(ty - cy) > 0.0004) {
        raf = requestAnimationFrame(tick)
      } else {
        raf = 0
      }
    }

    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1
      ty = (e.clientY / window.innerHeight) * 2 - 1
      if (!raf) raf = requestAnimationFrame(tick)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={ref} className="bg-fx" aria-hidden="true">
      <div className="bg-fx__track" style={{ '--depth': '38px' } as CSSProperties}>
        <div className="bg-fx__blob bg-fx__blob--accent" />
      </div>
      <div className="bg-fx__track" style={{ '--depth': '72px' } as CSSProperties}>
        <div className="bg-fx__blob bg-fx__blob--mint" />
      </div>
      <div className="bg-fx__track" style={{ '--depth': '54px' } as CSSProperties}>
        <div className="bg-fx__blob bg-fx__blob--ember" />
      </div>
    </div>
  )
}

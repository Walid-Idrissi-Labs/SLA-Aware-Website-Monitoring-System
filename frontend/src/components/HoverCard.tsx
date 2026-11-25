import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const MARGIN = 8
const GAP = 8
/** Keeps the caret off the card's rounded corners when it is clamped at a screen edge. */
const CARET_INSET = 12

/**
 * Floating card that grows out of an anchor element. Rendered into <body> so
 * no `overflow: hidden` ancestor can clip it, positioned with a transform so
 * moving to another anchor slides on the compositor instead of re-laying out,
 * and it never takes pointer events. It opens above the anchor and flips below
 * when its own measured height does not fit. The caller decides when it opens
 * and closes, and passes the anchor's viewport rectangle.
 */
export default function HoverCard({
  anchor,
  leaving = false,
  width = 208,
  children,
}: {
  anchor: DOMRect
  /** True during the short fade-out before the caller unmounts it. */
  leaving?: boolean
  width?: number
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(120)
  // Measured before paint, so a card that does not fit above never shows there.
  useLayoutEffect(() => {
    const measured = ref.current?.offsetHeight
    if (measured && measured !== height) setHeight(measured)
  })
  // Motion starts a frame after mount, so the jump from the first height guess
  // to the measured spot is never animated; only moves between anchors are.
  const [placed, setPlaced] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPlaced(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const centre = anchor.left + anchor.width / 2
  const x = Math.min(Math.max(centre - width / 2, MARGIN), window.innerWidth - MARGIN - width)
  const below = anchor.top < height + GAP + MARGIN
  const y = below ? anchor.bottom + GAP : anchor.top - GAP
  // The caret stays on the anchor even when the card is clamped at a screen edge.
  const caret = Math.min(Math.max(centre - x, CARET_INSET), width - CARET_INSET)

  return createPortal(
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-50 ease-out"
      style={{
        width,
        transform: `translate3d(${x}px, ${y}px, 0)${below ? '' : ' translateY(-100%)'}`,
        opacity: leaving ? 0 : 1,
        transitionProperty: placed ? 'transform, opacity' : 'none',
        transitionDuration: leaving ? '80ms' : '90ms',
      }}
    >
      <div
        className="relative animate-card-pop rounded-md border border-white/10 bg-[#16191e] px-2.5 py-2 text-[11.5px] leading-tight shadow-xl"
        style={{ transformOrigin: `${caret}px ${below ? '0%' : '100%'}` }}
      >
        {children}
        <span
          className={`absolute h-2 w-2 rotate-45 border-white/10 bg-[#16191e] ${
            below ? '-top-[5px] border-l border-t' : '-bottom-[5px] border-b border-r'
          }`}
          style={{ left: caret - 4 }}
        />
      </div>
    </div>,
    document.body,
  )
}

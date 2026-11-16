import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

export interface MagicBentoItem {
  id?: string | number
  label?: ReactNode
  title?: ReactNode
  description?: ReactNode
  /** Content for the card's visual area — a figure, a chart, a list. This is
   *  the part that carries the data; the title/description sit underneath it. */
  visual?: ReactNode
  content?: ReactNode
  onClick?: () => void
  colSpan?: number
  rowSpan?: number
}

interface Props {
  items?: MagicBentoItem[]
  columns?: number
  rowHeight?: number
  gap?: number
  radius?: number
  /** Space-separated rgb triple for the glow, e.g. "250 92 41". */
  glow?: string
  spotlightRadius?: number
  /** Narrowest a cell may get before the grid drops a column. */
  minCell?: number
  className?: string
}

const MIN_PAIR_RATIO = 1.33

/**
 * Bento grid with a pointer-tracked spotlight and border glow.
 *
 * Deliberately lighter than the reference component: the demo visuals, star
 * canvas, tilt, magnetism and click wave are gone. Each of those either had no
 * use here or cost a spring integration per card per frame. What remains is one
 * rAF loop that idles the moment the pointer stops, one gradient per card, and
 * CSS-only intro/column changes. Cards far from the pointer are skipped
 * entirely rather than written with zeroes every frame.
 */
export default function MagicBento({
  items = [],
  columns = 4,
  rowHeight = 200,
  gap = 10,
  radius = 19,
  glow = '250 92 41',
  spotlightRadius = 330,
  minCell = 158,
  className = '',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<(HTMLDivElement | null)[]>([])
  const cardRefs = useRef<(HTMLElement | null)[]>([])
  const [cols, setCols] = useState(Math.max(1, columns))

  // Read by the engine without re-subscribing it on every render.
  const live = useRef({ columns, gap, spotlightRadius, minCell })
  live.current = { columns, gap, spotlightRadius, minCell }

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let rects: (DOMRect | null)[] = []
    let dirty = true
    let raf = 0
    let last = performance.now()
    let visible = true

    const pointer = { x: 0, y: 0, inside: false }
    const light = { x: 0, y: 0 }

    const measure = () => {
      dirty = false
      rects = cellRefs.current.map((cell) => (cell ? cell.getBoundingClientRect() : null))
    }

    const paint = () => {
      if (dirty) measure()
      const reach = live.current.spotlightRadius
      for (let i = 0; i < cardRefs.current.length; i++) {
        const card = cardRefs.current[i]
        const rect = rects[i]
        if (!card || !rect) continue
        const x = light.x - rect.left
        const y = light.y - rect.top
        const near =
          pointer.inside &&
          x > -reach &&
          x < rect.width + reach &&
          y > -reach &&
          y < rect.height + reach
        // A card that was already dark and stays dark needs no writes at all.
        if (!near && card.dataset.near === '0') continue
        card.dataset.near = near ? '1' : '0'
        card.style.setProperty('--mb-x', `${x.toFixed(0)}px`)
        card.style.setProperty('--mb-y', `${y.toFixed(0)}px`)
      }
    }

    const frame = (now: number) => {
      raf = 0
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const k = 1 - Math.exp(-dt / 0.06)
      light.x += (pointer.x - light.x) * k
      light.y += (pointer.y - light.y) * k
      const moving = Math.abs(pointer.x - light.x) + Math.abs(pointer.y - light.y) > 0.5
      if (!moving) {
        light.x = pointer.x
        light.y = pointer.y
      }
      paint()
      if (moving && visible) raf = requestAnimationFrame(frame)
    }

    const wake = () => {
      if (raf || !visible) return
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.inside = true
      root.dataset.pointer = ''
      wake()
    }

    const onLeave = () => {
      pointer.inside = false
      delete root.dataset.pointer
      wake()
    }

    const onScroll = () => {
      dirty = true
      if (!pointer.inside) {
        paint()
        return
      }
      wake()
    }

    const resize = new ResizeObserver(() => {
      const width = root.clientWidth
      const { columns: want, gap: space, minCell: floor } = live.current
      const cell = (count: number) => (width - space * (count - 1)) / count
      const next = cell(want) >= floor ? want : want >= 2 && cell(2) >= floor * MIN_PAIR_RATIO ? 2 : 1
      setCols(next)
      dirty = true
      if (pointer.inside) wake()
      else paint()
    })
    resize.observe(root)

    const visibility = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting)
      if (visible) {
        dirty = true
        if (pointer.inside) wake()
      }
    })
    visibility.observe(root)

    paint()

    if (!reduced) {
      // Pointer events stay on the grid itself — no global listeners, so no
      // work at all while the cursor is elsewhere on the page.
      root.addEventListener('pointermove', onMove, { passive: true })
      root.addEventListener('pointerleave', onLeave, { passive: true })
      window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    }

    return () => {
      cancelAnimationFrame(raf)
      resize.disconnect()
      visibility.disconnect()
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('scroll', onScroll, { capture: true })
    }
    // Column changes are handled inside the ResizeObserver via the `live` ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const span = Math.max(1, cols)

  cellRefs.current.length = items.length
  cardRefs.current.length = items.length

  return (
    <div
      ref={rootRef}
      className={`mb ${className}`.trim()}
      style={
        {
          gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))`,
          gridAutoRows: span === 1 ? `minmax(${rowHeight}px, auto)` : `${rowHeight}px`,
          gap: `${gap}px`,
          '--mb-radius': `${Math.max(0, radius)}px`,
          '--mb-glow': glow,
          '--mb-reach': `${spotlightRadius}px`,
        } as CSSProperties
      }
    >
      {items.map((item, index) => {
        const clickable = Boolean(item.onClick)
        const body = (
          <>
            <span className="mb__spot" aria-hidden="true" />
            {item.content ?? (
              <div className="mb__body">
                {item.label && <span className="mb__label">{item.label}</span>}
                {item.visual && (
                  <div className="mb__visual" aria-hidden="true">
                    {item.visual}
                  </div>
                )}
                {(item.title || item.description) && (
                  <div className="mb__text">
                    {item.title && <h3 className="mb__title">{item.title}</h3>}
                    {item.description && <p className="mb__desc">{item.description}</p>}
                  </div>
                )}
              </div>
            )}
            <span className="mb__rim" aria-hidden="true" />
          </>
        )
        const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
          if (!clickable) return
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          item.onClick?.()
        }

        return (
          <div
            key={item.id ?? index}
            ref={(element) => {
              cellRefs.current[index] = element
            }}
            className="mb__cell"
            style={{
              gridColumn: `span ${Math.min(span, Math.max(1, item.colSpan ?? 1))}`,
              gridRow: `span ${Math.max(1, item.rowSpan ?? 1)}`,
            }}
          >
            <div
              ref={(element) => {
                cardRefs.current[index] = element
              }}
              className="mb__card group"
              data-clickable={clickable ? '' : undefined}
              data-near="0"
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? item.onClick : undefined}
              onKeyDown={clickable ? onKeyDown : undefined}
            >
              {body}
            </div>
          </div>
        )
      })}
    </div>
  )
}

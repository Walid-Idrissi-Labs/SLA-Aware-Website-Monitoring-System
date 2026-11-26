import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'

interface Props<T> {
  /** Oldest first; the newest sits at the right edge. */
  items: T[]
  /** Total bars. Missing ones are padded on the left so the strip keeps its width. */
  slots: number
  keyOf: (item: T) => string | number
  /** Classes for one bar, given whether it is the one being inspected. */
  barClass: (item: T, active: boolean) => string
  barStyle?: (item: T) => CSSProperties | undefined
  /** The hover card for the item at `index`, placed on `anchor`. */
  card: (index: number, anchor: DOMRect, leaving: boolean) => ReactNode
  /** What the live region reads when an item is inspected. */
  describe: (item: T) => string
  /** Accessible summary of the whole strip. */
  label: string
  /** One tab stop with arrow keys, and tap to pin on touch. Leave it off inside
   *  a clickable card, where focus and taps belong to the card. */
  interactive?: boolean
  /** Height and gap of the bars. */
  size?: string
  className?: string
}

/** A row of bars with a hover card per bar: glide the pointer along it, or
 *  focus it and use the arrow keys. Shared by the per-check and per-day strips. */
export default function BarStrip<T>({
  items,
  slots,
  keyOf,
  barClass,
  barStyle,
  card,
  describe,
  label,
  interactive = false,
  size = 'h-6 gap-[2px]',
  className,
}: Props<T>) {
  const empties = Math.max(0, slots - items.length)

  // Keyed, not indexed, so a poll that shifts the strip cannot swap the item under the cursor.
  const [activeKey, setActiveKey] = useState<string | number | null>(null)
  const [leaving, setLeaving] = useState(false)
  const pinned = useRef(false)
  const timer = useRef(0)
  const root = useRef<HTMLDivElement>(null)
  const barEls = useRef<(HTMLDivElement | null)[]>([])
  const active = activeKey == null ? -1 : items.findIndex((item) => keyOf(item) === activeKey)
  const open = active >= 0
  // Read at render time so the card follows its bar if a poll moves it.
  const anchor = open ? barEls.current[active]?.getBoundingClientRect() : undefined

  const show = (i: number, immediately = false) => {
    window.clearTimeout(timer.current)
    const key = keyOf(items[i])
    const reveal = () => {
      setActiveKey(key)
      setLeaving(false)
    }
    // A short intent delay on the first open only, so a cursor merely crossing
    // the strip does not flash a card; moving between bars stays instant.
    if (open || immediately) reveal()
    else timer.current = window.setTimeout(reveal, 70)
  }
  const hide = (immediately = false) => {
    window.clearTimeout(timer.current)
    pinned.current = false
    if (immediately) {
      setActiveKey(null)
      return
    }
    // A short grace so crossing a 2px gap does not flicker, then the fade.
    timer.current = window.setTimeout(() => {
      setLeaving(true)
      timer.current = window.setTimeout(() => setActiveKey(null), 80)
    }, 60)
  }

  useEffect(() => {
    if (!open) return
    // The card sits in viewport coordinates, which any scroll or resize makes stale.
    const close = () => hide(true)
    const outside = (e: PointerEvent) => {
      if (pinned.current && !root.current?.contains(e.target as Node)) hide(true)
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    document.addEventListener('pointerdown', outside)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('pointerdown', outside)
    }
  }, [open])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') return hide(true)
    const last = items.length - 1
    const from = open ? active : last
    const next = ({ ArrowLeft: Math.max(0, from - 1), ArrowRight: Math.min(last, from + 1), Home: 0, End: last } as Record<string, number>)[e.key]
    if (next == null || last < 0) return
    e.preventDefault()
    show(next, true)
  }

  return (
    <div
      ref={root}
      role={interactive ? 'group' : 'img'}
      aria-label={label}
      tabIndex={interactive && items.length ? 0 : undefined}
      onFocus={interactive ? () => items.length > 0 && !open && show(items.length - 1, true) : undefined}
      onBlur={interactive ? () => hide(true) : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      onPointerLeave={(e) => e.pointerType !== 'touch' && !pinned.current && hide()}
      className={`flex items-end ${size} rounded-[2px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className ?? ''}`}
    >
      {Array.from({ length: empties }).map((_, i) => (
        <div key={`e-${i}`} className="flex-1 h-full rounded-[1px] bg-white/[0.04]" />
      ))}
      {items.map((item, i) => (
        <div
          key={keyOf(item)}
          ref={(el) => {
            barEls.current[i] = el
          }}
          aria-hidden="true"
          onPointerEnter={(e) => e.pointerType !== 'touch' && !pinned.current && show(i)}
          onPointerDown={
            interactive
              ? (e) => {
                  if (e.pointerType !== 'touch') return
                  pinned.current = true
                  show(i, true)
                }
              : undefined
          }
          className={`flex-1 h-full rounded-[1px] transition-[opacity,background-color] duration-[120ms] ${barClass(item, i === active)} ${
            open && i !== active ? 'opacity-[0.65]' : ''
          }`}
          style={barStyle?.(item)}
        />
      ))}
      {open && anchor && card(active, anchor, leaving)}
      {interactive && (
        <span className="sr-only" aria-live="polite">
          {open ? describe(items[active]) : ''}
        </span>
      )}
    </div>
  )
}

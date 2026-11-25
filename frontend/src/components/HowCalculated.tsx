import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import HoverCard, { HoverRow as Row } from './HoverCard'

interface Props {
  /** Shown before the "?", usually the tile's title. */
  label?: ReactNode
  /** Read out as "How is {topic} calculated?". */
  topic: string
  /** The operands, carrying the figure's own numbers. */
  rows?: { label: string; value: ReactNode }[]
  /** The formula with its result, e.g. "1,412 ÷ 1,415 = 99.79%". */
  result?: ReactNode
  /** One sentence on what the figure leaves out or assumes. */
  caveat: string
  /** Replaces the rows and result when there is nothing to compute yet. */
  empty?: string | false
}

/**
 * A "?" that shows how a figure is calculated, filled in with the figure's own
 * numbers. Hover or focus previews it; a click or tap pins it until Esc or a
 * click elsewhere. The card itself is decorative (aria-hidden), so the same
 * explanation is always mounted, visually hidden, as the button's description.
 */
export default function HowCalculated({ label, topic, rows = [], result, caveat, empty }: Props) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const shown = hovered || pinned
  // Read at render time so the card follows the button if the tile re-lays out.
  const anchor = shown ? button.current?.getBoundingClientRect() : undefined

  useEffect(() => {
    if (!shown) return
    const close = () => {
      setHovered(false)
      setPinned(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const outside = (e: PointerEvent) => {
      if (!button.current?.contains(e.target as Node)) close()
    }
    // The card sits in viewport coordinates, which any scroll or resize makes stale.
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    document.addEventListener('pointerdown', outside)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('pointerdown', outside)
    }
  }, [shown])

  const help = (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`How is ${topic} calculated?`}
        aria-describedby={id}
        aria-expanded={shown}
        onPointerEnter={(e) => e.pointerType !== 'touch' && setHovered(true)}
        onPointerLeave={(e) => e.pointerType !== 'touch' && setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => {
          setHovered(false)
          setPinned(false)
        }}
        // Never let the tile underneath treat this as its own click.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          setPinned((was) => !was)
        }}
        className="-my-1 inline-grid h-6 w-6 flex-none place-items-center rounded-full text-txt-lo outline-none transition-colors hover:text-txt-hi focus-visible:text-txt-hi focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <CircleHelp className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      {/* Phrasing content only: this usually sits inside a heading. */}
      <span id={id} className="sr-only">
        {empty ? `${empty}. ` : rows.map((row) => <span key={row.label}>{row.label}: {row.value}. </span>)}
        {!empty && result && <span>{result}. </span>}
        {caveat}
      </span>
      {shown && anchor && (
        <HoverCard anchor={anchor} width={256}>
          {empty ? (
            <p className="text-txt-lo">{empty}</p>
          ) : (
            <>
              <dl className="space-y-1">
                {rows.map((row) => (
                  <Row key={row.label} label={row.label}>
                    {row.value}
                  </Row>
                ))}
              </dl>
              {result && (
                <>
                  <div className="my-1.5 h-px bg-white/[0.06]" />
                  <p className="font-mono tabular-nums text-txt-hi">{result}</p>
                </>
              )}
            </>
          )}
          <p className="mt-1.5 leading-snug text-txt-lo">{caveat}</p>
        </HoverCard>
      )}
    </>
  )

  return label ? (
    <span className="inline-flex items-center gap-1">
      {label}
      {help}
    </span>
  ) : (
    help
  )
}

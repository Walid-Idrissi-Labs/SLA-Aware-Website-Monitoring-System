import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Check } from '../types'
import { fmtUtcTime } from '../lib/format'
import CheckCard, { measuredLatency } from './CheckCard'

interface Props {
  checks: Check[]
  /** number of bars to render (most recent, right-aligned) */
  bars?: number
  className?: string
  /** Shown beside a measured latency in the hover card. */
  latencyTarget?: number
  /** One tab stop with arrow keys, and tap to pin on touch. Leave it off inside
   *  a clickable card, where focus and taps belong to the card. */
  interactive?: boolean
}

/** Three tones: green = up, red = down, neutral = no evidence. An inconclusive
 *  check is not a failure, so it must not borrow the down colour. */
const TONE = {
  success: { bar: 'bg-ok/70', on: 'bg-ok', glow: undefined, label: 'UP' },
  failure: {
    bar: 'bg-crit/80',
    on: 'bg-crit',
    glow: '0 0 6px -1px rgba(248,113,113,0.7)',
    label: 'DOWN',
  },
  inconclusive: { bar: 'bg-white/20', on: 'bg-white/35', glow: undefined, label: 'NO EVIDENCE' },
} as const

/** The same-status run that ends at `index`, and whether it reaches the oldest loaded check. */
function runEndingAt(sorted: Check[], index: number) {
  let start = index
  while (start > 0 && sorted[start - 1].status === sorted[index].status) start--
  return { count: index - start + 1, open: start === 0 }
}

const describe = (c: Check) => {
  const latency = measuredLatency(c)
  return `${(TONE[c.status] ?? TONE.inconclusive).label} · ${latency != null ? `${latency}ms` : 'no latency'} · ${fmtUtcTime(c.timestamp)}`
}

/** Classic uptime bar strip: one bar per check — green up, red down, grey no data.
 *  Hovering (or arrowing to) a bar opens a card with that check's details. */
export default function StatusStrip({ checks, bars = 40, className, latencyTarget, interactive = false }: Props) {
  const sorted = useMemo(() => [...checks].sort((a, b) => a.timestamp - b.timestamp), [checks])
  const offset = Math.max(0, sorted.length - bars)
  const recent = sorted.slice(offset)
  // pad with empty slots on the left so the strip is always full width
  const empties = Math.max(0, bars - recent.length)

  // Keyed by timestamp, so a poll that shifts the strip cannot swap the check under the cursor.
  const [activeTs, setActiveTs] = useState<number | null>(null)
  const [leaving, setLeaving] = useState(false)
  const pinned = useRef(false)
  const timer = useRef(0)
  const root = useRef<HTMLDivElement>(null)
  const barEls = useRef<(HTMLDivElement | null)[]>([])
  const active = activeTs == null ? -1 : recent.findIndex((c) => c.timestamp === activeTs)
  const open = active >= 0
  // Read at render time so the card follows its bar if a poll moves it.
  const anchor = open ? barEls.current[active]?.getBoundingClientRect() : undefined

  const show = (i: number, immediately = false) => {
    window.clearTimeout(timer.current)
    const ts = recent[i].timestamp
    const reveal = () => {
      setActiveTs(ts)
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
      setActiveTs(null)
      return
    }
    // A short grace so crossing a 2px gap does not flicker, then the fade.
    timer.current = window.setTimeout(() => {
      setLeaving(true)
      timer.current = window.setTimeout(() => setActiveTs(null), 80)
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
    const last = recent.length - 1
    const from = open ? active : last
    const next = ({ ArrowLeft: Math.max(0, from - 1), ArrowRight: Math.min(last, from + 1), Home: 0, End: last } as Record<string, number>)[e.key]
    if (next == null || last < 0) return
    e.preventDefault()
    show(next, true)
  }

  const counts = { success: 0, failure: 0, inconclusive: 0 }
  for (const c of recent) counts[c.status in counts ? c.status : 'inconclusive'] += 1
  const summary = recent.length
    ? `Last ${recent.length} checks: ${counts.success} up, ${counts.failure} down, ${counts.inconclusive} without evidence`
    : 'No checks yet'

  return (
    <div
      ref={root}
      role={interactive ? 'group' : 'img'}
      aria-label={interactive && recent.length ? `${summary}. Arrow keys inspect each check.` : summary}
      tabIndex={interactive && recent.length ? 0 : undefined}
      onFocus={interactive ? () => recent.length > 0 && !open && show(recent.length - 1, true) : undefined}
      onBlur={interactive ? () => hide(true) : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      onPointerLeave={(e) => e.pointerType !== 'touch' && !pinned.current && hide()}
      className={`flex items-end gap-[2px] h-6 rounded-[2px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className ?? ''}`}
    >
      {Array.from({ length: empties }).map((_, i) => (
        <div key={`e-${i}`} className="flex-1 h-full rounded-[1px] bg-white/[0.04]" />
      ))}
      {recent.map((c, i) => {
        const tone = TONE[c.status] ?? TONE.inconclusive
        return (
          <div
            key={c.timestamp ?? i}
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
            className={`flex-1 h-full rounded-[1px] transition-[opacity,background-color] duration-[120ms] ${
              i === active ? tone.on : tone.bar
            } ${open && i !== active ? 'opacity-[0.65]' : ''}`}
            style={tone.glow ? { boxShadow: tone.glow } : undefined}
          />
        )
      })}
      {open && anchor && (
        <CheckCard
          check={recent[active]}
          streak={runEndingAt(sorted, offset + active)}
          anchor={anchor}
          leaving={leaving}
          latencyTarget={latencyTarget}
        />
      )}
      {interactive && (
        <span className="sr-only" aria-live="polite">
          {open ? describe(recent[active]) : ''}
        </span>
      )}
    </div>
  )
}

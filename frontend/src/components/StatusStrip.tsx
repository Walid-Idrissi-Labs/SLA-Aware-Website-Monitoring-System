import { useMemo } from 'react'
import type { Check } from '../types'
import { fmtUtcTime } from '../lib/format'
import BarStrip from './BarStrip'
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

const toneOf = (c: Check) => TONE[c.status] ?? TONE.inconclusive

/** The same-status run that ends at `index`, and whether it reaches the oldest loaded check. */
function runEndingAt(sorted: Check[], index: number) {
  let start = index
  while (start > 0 && sorted[start - 1].status === sorted[index].status) start--
  return { count: index - start + 1, open: start === 0 }
}

const describe = (c: Check) => {
  const latency = measuredLatency(c)
  return `${toneOf(c).label} · ${latency != null ? `${latency}ms` : 'no latency'} · ${fmtUtcTime(c.timestamp)}`
}

/** Classic uptime bar strip: one bar per check — green up, red down, grey no data.
 *  Hovering (or arrowing to) a bar opens a card with that check's details. */
export default function StatusStrip({ checks, bars = 40, className, latencyTarget, interactive = false }: Props) {
  const sorted = useMemo(() => [...checks].sort((a, b) => a.timestamp - b.timestamp), [checks])
  const offset = Math.max(0, sorted.length - bars)
  const recent = sorted.slice(offset)

  const counts = { success: 0, failure: 0, inconclusive: 0 }
  for (const c of recent) counts[c.status in counts ? c.status : 'inconclusive'] += 1
  const summary = recent.length
    ? `Last ${recent.length} checks: ${counts.success} up, ${counts.failure} down, ${counts.inconclusive} without evidence`
    : 'No checks yet'

  return (
    <BarStrip
      items={recent}
      slots={bars}
      keyOf={(c) => c.timestamp}
      barClass={(c, active) => (active ? toneOf(c).on : toneOf(c).bar)}
      barStyle={(c) => {
        const glow = toneOf(c).glow
        return glow ? { boxShadow: glow } : undefined
      }}
      card={(i, anchor, leaving) => (
        <CheckCard
          check={recent[i]}
          streak={runEndingAt(sorted, offset + i)}
          anchor={anchor}
          leaving={leaving}
          latencyTarget={latencyTarget}
        />
      )}
      describe={describe}
      label={interactive && recent.length ? `${summary}. Arrow keys inspect each check.` : summary}
      interactive={interactive}
      className={className}
    />
  )
}

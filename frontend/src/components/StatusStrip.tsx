import type { Check } from '../types'
import { fmtUtcTime } from '../lib/format'

interface Props {
  checks: Check[]
  /** number of bars to render (most recent, right-aligned) */
  bars?: number
  className?: string
}

/** Three tones: green = up, red = down, neutral = no evidence. An inconclusive
 *  check is not a failure, so it must not borrow the down colour. */
const TONE = {
  success: { bar: 'bg-ok/70 hover:bg-ok', glow: undefined, label: 'UP' },
  failure: {
    bar: 'bg-crit/80 hover:bg-crit',
    glow: '0 0 6px -1px rgba(248,113,113,0.7)',
    label: 'DOWN',
  },
  inconclusive: { bar: 'bg-white/20 hover:bg-white/35', glow: undefined, label: 'NO EVIDENCE' },
} as const

/** Classic uptime bar strip: one bar per check — green up, red down, grey no data. */
export default function StatusStrip({ checks, bars = 40, className }: Props) {
  const sorted = [...checks].sort((a, b) => a.timestamp - b.timestamp)
  const recent = sorted.slice(-bars)
  // pad with empty slots on the left so the strip is always full width
  const empties = Math.max(0, bars - recent.length)

  return (
    <div className={`flex items-end gap-[2px] h-6 ${className ?? ''}`}>
      {Array.from({ length: empties }).map((_, i) => (
        <div key={`e-${i}`} className="flex-1 h-full rounded-[1px] bg-white/[0.04]" />
      ))}
      {recent.map((c, i) => {
        const tone = TONE[c.status] ?? TONE.inconclusive
        // A timeout records a synthetic latency; showing it as a measurement
        // would invent a number nobody observed.
        const latency = c.status === 'inconclusive' ? '—' : `${c.latency_ms}ms`
        return (
          <div
            key={c.timestamp ?? i}
            title={`${tone.label} · ${latency} · ${fmtUtcTime(c.timestamp)}`}
            className={`flex-1 h-full rounded-[1px] transition-colors ${tone.bar}`}
            style={tone.glow ? { boxShadow: tone.glow } : undefined}
          />
        )
      })}
    </div>
  )
}

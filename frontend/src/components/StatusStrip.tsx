import type { Check } from '../types'
import { fmtUtcTime } from '../lib/format'

interface Props {
  checks: Check[]
  /** number of bars to render (most recent, right-aligned) */
  bars?: number
  className?: string
}

/** Uptime bar strip: one bar per check — green up, red down, muted no-data. */
export default function StatusStrip({ checks, bars = 40, className }: Props) {
  const sorted = [...checks].sort((a, b) => a.timestamp - b.timestamp)
  const recent = sorted.slice(-bars)
  // pad with empty slots on the left so the strip is always full width
  const empties = Math.max(0, bars - recent.length)

  return (
    <div className={`flex h-5 items-stretch gap-[3px] ${className ?? ''}`}>
      {Array.from({ length: empties }).map((_, i) => (
        <div key={`e-${i}`} className="flex-1 rounded-[2px] bg-soft" />
      ))}
      {recent.map((c, i) => {
        const up = c.status === 'success'
        return (
          <div
            key={c.timestamp ?? i}
            title={`${up ? 'Up' : 'Down'} · ${c.latency_ms}ms · ${fmtUtcTime(c.timestamp)}`}
            className={`flex-1 rounded-[2px] transition-colors ${up ? 'bg-ok/75 hover:bg-ok' : 'bg-crit/90 hover:bg-crit'}`}
          />
        )
      })}
    </div>
  )
}

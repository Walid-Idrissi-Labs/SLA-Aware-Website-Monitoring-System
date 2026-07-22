import type { Check } from '../types'
import { fmtUtcTime } from '../lib/format'

interface Props {
  checks: Check[]
  /** number of bars to render (most recent, right-aligned) */
  bars?: number
  className?: string
}

/** Classic uptime bar strip: one bar per check, green = up, red = down. */
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
        const up = c.status === 'success'
        return (
          <div
            key={c.timestamp ?? i}
            title={`${up ? 'UP' : 'DOWN'} · ${c.latency_ms}ms · ${fmtUtcTime(c.timestamp)}`}
            className={`flex-1 h-full rounded-[1px] transition-colors ${
              up ? 'bg-ok/70 hover:bg-ok' : 'bg-crit/80 hover:bg-crit'
            }`}
            style={up ? undefined : { boxShadow: '0 0 6px -1px rgba(248,113,113,0.7)' }}
          />
        )
      })}
    </div>
  )
}

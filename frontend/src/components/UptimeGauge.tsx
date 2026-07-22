import { useEffect, useState } from 'react'
import { clamp, STATUS } from '../lib/format'

interface Props {
  /** 0–100 */
  value: number | null
  size?: number
  stroke?: number
  label?: string
}

// Bands mirror the backend severity ladder (healthy / degraded / major / critical).
function colorFor(pct: number): string {
  if (pct >= 99.9) return STATUS.ok
  if (pct >= 99) return STATUS.warn
  if (pct >= 95) return '#fb923c'
  return STATUS.crit
}

/** Radial gauge that sweeps to the target value on mount. */
export default function UptimeGauge({ value, size = 132, stroke = 9, label = 'UPTIME' }: Props) {
  const target = value === null ? 0 : clamp(value, 0, 100)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setProgress(target)
      return
    }
    // Double rAF: the first frame paints the 0 state, the second starts the
    // CSS transition — a single rAF can skip the sweep entirely.
    let id2 = 0
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setProgress(target))
    })
    return () => {
      cancelAnimationFrame(id1)
      if (id2) cancelAnimationFrame(id2)
    }
  }, [target])

  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const color = value === null ? '#5c646d' : colorFor(target)
  const offset = c - (progress / 100) * c

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)',
            filter: `drop-shadow(0 0 6px ${color}66)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="data text-[26px] font-bold leading-none" style={{ color }}>
          {value === null ? '—' : value.toFixed(2)}
          {value !== null && <span className="text-[13px] text-txt-lo font-medium">%</span>}
        </span>
        <span className="micro mt-1.5">{label}</span>
      </div>
    </div>
  )
}

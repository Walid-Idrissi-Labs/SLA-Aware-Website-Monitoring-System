import { useEffect, useId, useRef, useState } from 'react'
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

const DURATION = 1400

/**
 * Radial uptime gauge. A single rAF eases one `progress` value from the
 * previous reading to the target, and BOTH the arc sweep and the counting
 * number are derived from it — so they animate in perfect lockstep. A glowing
 * bead rides the tip of the arc to read as a live instrument.
 */
export default function UptimeGauge({ value, size = 190, stroke = 11, label = 'UPTIME' }: Props) {
  const target = value === null ? 0 : clamp(value, 0, 100)
  const isNull = value === null

  const [progress, setProgress] = useState(0)
  const progressRef = useRef(0)
  const fromRef = useRef(0)
  const rafRef = useRef<number>()

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const from = fromRef.current
    const to = target
    if (reduce || from === to) {
      progressRef.current = to
      fromRef.current = to
      setProgress(to)
      return
    }

    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / DURATION, 1)
      // easeOutExpo — fast pickup, long graceful settle (matches AnimatedNumber)
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      const next = from + (to - from) * eased
      progressRef.current = next
      setProgress(next)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      // Resume from what's actually on screen so a re-triggered sweep never snaps.
      fromRef.current = progressRef.current
    }
  }, [target])

  const gid = useId().replace(/:/g, '')
  // Inset the ring so the soft glow and tip bead have room and aren't clipped
  // by the (exactly size×size) svg box.
  const pad = 10
  const r = (size - stroke) / 2 - pad
  const c = 2 * Math.PI * r
  const color = isNull ? '#5c646d' : colorFor(target)
  const shown = clamp(progress, 0, 100)
  const offset = c - (shown / 100) * c

  // Bead position: the arc begins at 12 o'clock (svg is rotated -90°) and sweeps
  // clockwise, so the tip sits `shown%` of the way around.
  const ang = (shown / 100) * 2 * Math.PI
  const bx = size / 2 + r * Math.cos(ang)
  const by = size / 2 + r * Math.sin(ang)
  const showBead = !isNull && shown > 0.1

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {/* soft colour bloom behind the whole dial */}
      {!isNull && (
        <div
          className="pointer-events-none absolute inset-4 rounded-full"
          style={{ background: `radial-gradient(circle, ${color}14, transparent 66%)` }}
        />
      )}

      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`arc-${gid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="55%" stopColor={color} stopOpacity="0.95" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* track */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.055)" strokeWidth={stroke} />
        {/* inner hairline for instrument depth */}
        <circle cx={size / 2} cy={size / 2} r={r - stroke / 2 - 3} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={1} />

        {/* progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#arc-${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 3px ${color}33)` }}
        />

        {/* bead riding the arc tip (static — no blink) */}
        {showBead && (
          <g style={{ filter: `drop-shadow(0 0 2px ${color}77)` }}>
            <circle cx={bx} cy={by} r={stroke / 2 + 0.5} fill={color} />
            <circle cx={bx} cy={by} r={stroke / 4} fill="#fff" opacity={0.9} />
          </g>
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="data font-bold leading-none" style={{ color, fontSize: 30 }}>
          {isNull ? '—' : shown.toFixed(2)}
          {!isNull && <span className="ml-0.5 text-[14px] font-medium text-txt-lo">%</span>}
        </span>
        <span className="micro mt-2">{label}</span>
      </div>
    </div>
  )
}

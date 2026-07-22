import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { clamp, STATUS } from '../lib/format'

interface Props {
  /** 0–100. `null` renders an empty track with a `—` readout. */
  value: number | null
  /** SVG footprint in px (matches the previous default of 190). */
  size?: number
  /** Arc + track stroke width in px. */
  stroke?: number
  /** Code label rendered inside the circle, below the readout. */
  label?: string
}

// Bands mirror the backend severity ladder (healthy / degraded / major / critical).
function colorFor(pct: number): string {
  if (pct >= 99.9) return STATUS.ok
  if (pct >= 99) return STATUS.warn
  if (pct >= 95) return '#fb923c'
  return STATUS.crit
}

// easeOutExpo — fast pickup, long graceful settle (matches AnimatedNumber).
const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))
// First reveal sweep (matches the cabin-feel of the new Gauge's cascade).
const REVEAL_MS = 2100
// Later value changes retarget fast — never longer (tempo rule).
const RETARGET_MS = 920

/**
 * Radial uptime gauge — a single measurement arc over a subtle track with a
 * centered mono value readout. The arc IS the measurement, so it takes color:
 * green (healthy), amber (degraded), orange (major), red (critical). No
 * gradient ramp, no glow, no bead — the arc length carries the reading.
 *
 * A single rAF eases one `progress` value from the previous reading to the
 * target, and BOTH the arc sweep and the counting number are derived from it,
 * so they animate in perfect lockstep. The reveal sweep fires once when the
 * gauge first enters the viewport; subsequent value changes retarget at the
 * fast tempo. Reduced motion renders the final reading instantly (layout
 * effect, no 0-frame flash).
 */
export default function UptimeGauge({ value, size = 190, stroke = 11, label = 'UPTIME' }: Props) {
  const target = value === null ? 0 : clamp(value, 0, 100)
  const isNull = value === null

  const color = isNull ? '#5c646d' : colorFor(target)

  // SVG geometry — arc starts at 12 o'clock, sweeps clockwise. No pad inset
  // (the new Gauge has no glow/bead to clip), so the ring fills the box.
  const cx = size / 2
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r

  // One animated number drives BOTH the arc and the readout, so they can
  // never drift out of sync (same contract as the previous UptimeGauge).
  const [progress, setProgress] = useState(0)
  const progressRef = useRef(0)
  const fromRef = useRef(0)
  const rafRef = useRef<number>()
  const revealedRef = useRef(false)

  // View-entry detection — a Gauge below the fold doesn't burn its reveal
  // off-screen (the Andromeda contract the new Gauge describes).
  const internalRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = internalRef.current
    if (!node) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true)
            obs.disconnect()
          }
        }
      },
      { threshold: 0.3 },
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [])

  const reduceRef = useRef(false)
  useLayoutEffect(() => {
    reduceRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  // Reduced motion + null: settle to the final reading BEFORE paint — a
  // layout effect re-renders synchronously, so the user never sees the
  // 0-frame.
  useLayoutEffect(() => {
    if (!reduceRef.current) return
    progressRef.current = target
    fromRef.current = target
    setProgress(target)
    revealedRef.current = true
  }, [target])

  useEffect(() => {
    if (reduceRef.current || !inView) return
    const first = !revealedRef.current
    revealedRef.current = true

    const from = fromRef.current
    const to = target
    if (from === to) {
      progressRef.current = to
      fromRef.current = to
      setProgress(to)
      return
    }

    const duration = first ? REVEAL_MS : RETARGET_MS
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = easeOutExpo(t)
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
  }, [inView, target])

  const shown = clamp(progress, 0, 100)
  const filled = (shown / 100) * circumference

  // Readout placement: value sits at center; with a label the pair splits
  // around the midline (value up, label below). A single null reading
  // centers the em-dash alone.
  const valueY = label ? cx - 4 : cx
  const labelY = cx + 22

  return (
    <div
      ref={internalRef}
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={isNull ? 'Uptime unknown' : `Uptime ${target.toFixed(2)} of 100%`}
      >
        {/* Track — context, never colored */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.055)"
          strokeWidth={stroke}
        />

        {/* Measurement arc — starts at 12 o'clock, hard butt cap */}
        {!isNull && filled > 0 && (
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={`${filled} ${circumference}`}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        )}

        {/* Readout — mono bold value, muted smaller unit */}
        <text
          x={cx}
          y={valueY}
          textAnchor="middle"
          dominantBaseline="central"
          fill={isNull ? '#5c646d' : '#eceef0'}
          style={{
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: size >= 150 ? 30 : size >= 110 ? 24 : 18,
            fontWeight: 700,
            letterSpacing: 'tight',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {isNull ? (
            '—'
          ) : (
            <>
              {shown.toFixed(2)}
              <tspan
                dx={2}
                fill="#5c646d"
                style={{
                  fontSize: size >= 150 ? 14 : size >= 110 ? 12 : 10,
                  fontWeight: 500,
                  letterSpacing: 'normal',
                }}
              >
                %
              </tspan>
            </>
          )}
        </text>

        {/* Code label — below the value, inside the circle */}
        {label && (
          <text
            x={cx}
            y={labelY}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#5c646d"
            style={{
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
            }}
          >
            {label}
          </text>
        )}
      </svg>
    </div>
  )
}

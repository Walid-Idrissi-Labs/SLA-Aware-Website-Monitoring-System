import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Check } from '../types'
import { STATUS, fmtUtcTime } from '../lib/format'

interface Props {
  checks: Check[]
  height?: number
}

function smoothPath(pts: readonly (readonly [number, number])[]): string {
  if (pts.length === 0) return ''
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
  }
  return d
}

export default function LatencyChart({ checks, height = 260 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  // null until the container has been measured — we never paint the SVG at a
  // guessed width, which is what caused the mid-draw "snap".
  const [width, setWidth] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const hasDrawn = useRef(false)

  // Measure synchronously before the first paint, then track resizes.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const sorted = useMemo(() => [...checks].sort((a, b) => a.timestamp - b.timestamp), [checks])

  const padT = 18
  const padB = 26
  const padL = 44
  const padR = 12
  const chartW = Math.max((width ?? 0) - padL - padR, 10)
  const chartH = height - padT - padB

  const model = useMemo(() => {
    if (sorted.length === 0 || width == null) return null
    const maxRaw = Math.max(...sorted.map((c) => c.latency_ms), 50)
    // round the top gridline to a friendly number
    const magnitude = Math.pow(10, Math.floor(Math.log10(maxRaw)))
    const top = Math.ceil(maxRaw / magnitude) * magnitude
    const x = (i: number) => padL + (i / (sorted.length - 1 || 1)) * chartW
    const y = (v: number) => padT + (1 - v / top) * chartH
    const pts = sorted.map((c, i) => [x(i), y(c.latency_ms)] as const)
    return { top, x, y, pts }
  }, [sorted, chartW, chartH, width])

  const line = model ? smoothPath(model.pts) : ''

  // Stroke-draw animation driven by the *real* path length. Using getTotalLength
  // (instead of a hardcoded dash) guarantees the whole line reveals smoothly
  // left→right and never clips its tail. Runs once per mount; later data updates
  // just refresh the dash length so nothing gets cut, without redrawing.
  useLayoutEffect(() => {
    const path = pathRef.current
    if (!path || !line) return
    const len = path.getTotalLength()
    if (hasDrawn.current) {
      path.style.transition = 'none'
      path.style.strokeDasharray = `${len}`
      path.style.strokeDashoffset = '0'
      return
    }
    hasDrawn.current = true
    path.style.transition = 'none'
    path.style.strokeDasharray = `${len}`
    path.style.strokeDashoffset = `${len}`
    path.getBoundingClientRect() // force reflow so the transition has a start value
    path.style.transition = 'stroke-dashoffset 1.15s cubic-bezier(0.22,1,0.36,1)'
    path.style.strokeDashoffset = '0'
  }, [line])

  if (sorted.length === 0) {
    return (
      <div ref={wrapRef} className="grid place-items-center" style={{ height }}>
        <p className="font-mono text-[11px] uppercase tracking-widest text-txt-dim">No data available</p>
      </div>
    )
  }

  // Measured on the first layout pass; the placeholder is never actually painted.
  if (width == null || !model) {
    return <div ref={wrapRef} style={{ height }} />
  }

  const { top, x, y } = model
  const baseline = padT + chartH
  const area = `${line} L ${x(sorted.length - 1).toFixed(2)} ${baseline} L ${padL} ${baseline} Z`
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f))

  const handleMove = (e: React.MouseEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const relX = e.clientX - rect.left - padL
    const idx = Math.round((relX / chartW) * (sorted.length - 1))
    setHover(Math.max(0, Math.min(sorted.length - 1, idx)))
  }

  const hoverCheck = hover !== null ? sorted[hover] : null
  const hoverX = hover !== null ? x(hover) : 0
  const hoverY = hoverCheck ? y(hoverCheck.latency_ms) : 0
  const tipLeft = Math.min(Math.max(hoverX, 60), width - 60)

  return (
    <div
      ref={wrapRef}
      className="relative select-none"
      style={{ height }}
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg width={width} height={height} className="block">
        <defs>
          <linearGradient id="lat-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={STATUS.accent} stopOpacity="0.28" />
            <stop offset="70%" stopColor={STATUS.accent} stopOpacity="0.04" />
            <stop offset="100%" stopColor={STATUS.accent} stopOpacity="0" />
          </linearGradient>
          {/* Keep the smoothed curve inside the plot box so latency spikes can't
              overshoot the smoothing above the top gridline. */}
          <clipPath id="lat-clip">
            <rect x={padL - 2} y={padT - 4} width={chartW + 4} height={chartH + 6} />
          </clipPath>
        </defs>

        {/* grid + y labels */}
        {gridVals.map((val, i) => {
          const gy = y(val)
          return (
            <g key={i}>
              <line x1={padL} y1={gy} x2={width - padR} y2={gy} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <text x={padL - 8} y={gy + 3} textAnchor="end" className="fill-txt-dim font-mono" fontSize="9">
                {val}
              </text>
            </g>
          )
        })}

        {/* area + line (clipped to the plot box) */}
        <g clipPath="url(#lat-clip)">
          <path d={area} fill="url(#lat-area)" />
          <path
            ref={pathRef}
            d={line}
            fill="none"
            stroke={STATUS.accent}
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>

        {/* failure markers */}
        {sorted.map((c, i) =>
          c.status === 'failure' ? (
            <circle key={i} cx={x(i)} cy={y(c.latency_ms)} r="3" fill={STATUS.crit} stroke="#0e1115" strokeWidth="1.5" />
          ) : null
        )}

        {/* crosshair */}
        {hoverCheck && (
          <g>
            <line x1={hoverX} y1={padT} x2={hoverX} y2={padT + chartH} stroke="rgba(250,92,41,0.4)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={hoverX} cy={hoverY} r="4.5" fill={STATUS.accent} stroke="#0e1115" strokeWidth="2" />
          </g>
        )}
      </svg>

      {/* x-axis time labels */}
      <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-between px-2 font-mono text-[9px] uppercase text-txt-dim" style={{ paddingLeft: padL, paddingRight: padR }}>
        <span>
          {fmtUtcTime(sorted[0].timestamp).slice(0, 5)} UTC
        </span>
        <span className="text-accent">Now</span>
      </div>

      {/* tooltip */}
      {hoverCheck && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-white/10 bg-ink-750/95 px-2.5 py-1.5 shadow-xl backdrop-blur"
          style={{ left: tipLeft, top: 6 }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-[3px] rounded-full"
              style={{ height: '0.75rem', background: hoverCheck.status === 'success' ? STATUS.ok : STATUS.crit }}
            />
            <span className="data text-[13px] font-bold text-txt-hi">{hoverCheck.latency_ms}ms</span>
          </div>
          <div className="mt-0.5 font-mono text-[9px] text-txt-lo">
            {fmtUtcTime(hoverCheck.timestamp)} · {hoverCheck.http_status_code || 'ERR'}
          </div>
        </div>
      )}
    </div>
  )
}

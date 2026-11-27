import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { niceMax, smoothPath } from '../lib/chart'

export interface TrendSeries {
  key: string
  label: string
  color: string
  values: number[]
}

interface Props {
  labels: string[]
  series: TrendSeries[]
  height?: number
  /** Rendered in the tooltip and the axis; defaults to a bare number. */
  format?: (value: number) => string
  /** Draw a gradient fill under each line. */
  area?: boolean
  emptyLabel?: string
  className?: string
}

const PAD_T = 14
const PAD_B = 22
const PAD_L = 38
const PAD_R = 10

/**
 * Multi-series line/area chart.
 *
 * Deliberately small: one measurement pass (ResizeObserver on the wrapper), one
 * memoised geometry model, and a hover index that only updates when the pointer
 * crosses into a different column — so moving across the chart re-renders once
 * per column, not once per mouse event. Paths are plain SVG, no chart library.
 */
export default function TrendChart({
  labels,
  series,
  height = 180,
  format = (value) => String(Math.round(value)),
  area = true,
  emptyLabel = 'No data in this window',
  className = '',
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width
      if (next) setWidth((previous) => (previous === next ? previous : next))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const count = labels.length
  const chartW = Math.max((width ?? 0) - PAD_L - PAD_R, 10)
  const chartH = Math.max(height - PAD_T - PAD_B, 10)

  const model = useMemo(() => {
    if (width == null || count === 0 || series.length === 0) return null
    const peak = Math.max(...series.flatMap((line) => line.values), 0)
    const top = niceMax(peak)
    const x = (index: number) => PAD_L + (count === 1 ? chartW / 2 : (index / (count - 1)) * chartW)
    const y = (value: number) => PAD_T + (1 - value / top) * chartH
    const lines = series.map((line) => {
      const pts = line.values.slice(0, count).map((value, index) => [x(index), y(value)] as const)
      const path = smoothPath(pts, true) // downtime can't go below 0m, so the curve mustn't either
      return { ...line, path, fill: `${path} L ${x(count - 1).toFixed(2)} ${(PAD_T + chartH).toFixed(2)} L ${x(0).toFixed(2)} ${(PAD_T + chartH).toFixed(2)} Z` }
    })
    return { top, x, y, lines, flat: peak === 0 }
  }, [width, count, series, chartW, chartH])

  const ticks = useMemo(() => {
    if (!model) return []
    return [0, 0.5, 1].map((fraction) => ({
      value: model.top * (1 - fraction),
      y: PAD_T + fraction * chartH,
    }))
  }, [model, chartH])

  const xLabels = useMemo(() => {
    if (count === 0) return []
    const slots = Math.min(6, count)
    const step = count <= slots ? 1 : (count - 1) / (slots - 1)
    return Array.from({ length: count <= slots ? count : slots }, (_, i) => Math.round(i * step))
  }, [count])

  const empty = !model || series.every((line) => line.values.every((value) => value === 0))

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!model || count === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const local = event.clientX - rect.left - PAD_L
    const index = Math.max(0, Math.min(count - 1, Math.round((local / chartW) * (count - 1))))
    setHover((previous) => (previous === index ? previous : index))
  }

  const hovered = hover != null && model ? hover : null

  return (
    <div className={`relative ${className}`.trim()}>
      <div ref={wrapRef} style={{ height }} className="relative w-full">
        {width != null && (
          <svg
            width={width}
            height={height}
            className="block touch-none"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            <defs>
              {series.map((line) => (
                <linearGradient key={line.key} id={`trend-${line.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={line.color} stopOpacity="0.24" />
                  <stop offset="100%" stopColor={line.color} stopOpacity="0.01" />
                </linearGradient>
              ))}
            </defs>

            {ticks.map((tick) => (
              <g key={tick.y}>
                <line
                  x1={PAD_L}
                  x2={width - PAD_R}
                  y1={tick.y}
                  y2={tick.y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="3 4"
                />
                <text x={PAD_L - 8} y={tick.y + 3} textAnchor="end" className="fill-txt-dim text-[9.5px]">
                  {format(tick.value)}
                </text>
              </g>
            ))}

            {xLabels.map((index) => (
              <text
                key={index}
                x={model!.x(index)}
                y={height - 6}
                textAnchor={index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle'}
                className="fill-txt-dim text-[9.5px]"
              >
                {labels[index]}
              </text>
            ))}

            {area &&
              model!.lines.map((line) => <path key={`f-${line.key}`} d={line.fill} fill={`url(#trend-${line.key})`} />)}

            {model!.lines.map((line) => (
              <path
                key={line.key}
                d={line.path}
                fill="none"
                stroke={line.color}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {hovered != null && (
              <>
                <line
                  x1={model!.x(hovered)}
                  x2={model!.x(hovered)}
                  y1={PAD_T}
                  y2={PAD_T + chartH}
                  stroke="rgba(255,255,255,0.18)"
                />
                {model!.lines.map((line) => (
                  <circle
                    key={`d-${line.key}`}
                    cx={model!.x(hovered)}
                    cy={model!.y(line.values[hovered] ?? 0)}
                    r="3"
                    fill="#0c0e11"
                    stroke={line.color}
                    strokeWidth="1.75"
                  />
                ))}
              </>
            )}
          </svg>
        )}
      </div>

      {empty && (
        <p className="pointer-events-none absolute inset-0 grid place-items-center text-[12px] text-txt-dim">
          {emptyLabel}
        </p>
      )}

      {hovered != null && model && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-md border border-white/10 bg-[#16191e] px-2 py-1.5 text-[11.5px] leading-tight shadow-xl"
          style={{
            left: Math.min(Math.max(model.x(hovered), 60), Math.max((width ?? 0) - 60, 60)),
            transform: 'translateX(-50%)',
          }}
        >
          <div className="mb-0.5 text-txt-dim">{labels[hovered]}</div>
          {series.map((line) => (
            <div key={line.key} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: line.color }} />
              <span className="text-txt-lo">{line.label}</span>
              <span className="ml-auto pl-2 font-medium tabular-nums text-txt-hi">
                {format(line.values[hovered] ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

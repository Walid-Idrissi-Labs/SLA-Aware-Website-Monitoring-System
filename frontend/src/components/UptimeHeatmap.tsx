import { useState } from 'react'

export interface HeatmapBucket {
  key: string
  /** Human label for the bucket, e.g. "14:00 UTC". */
  label: string
  /** Conclusive uptime for the bucket, or null when nothing was conclusive —
   *  "no evidence" is not "0%". */
  uptime: number | null
  checks: number
  conclusive: number
}

interface Props {
  buckets: HeatmapBucket[]
  /** Cells per row. Defaults to 24 so one row is roughly one day of hours. */
  columns?: number
  shape?: 'square' | 'rounded' | 'circle'
  className?: string
}

/**
 * Uptime heatmap: one cell per time bucket, coloured on a green → yellow →
 * orange → red ramp. Grey means no conclusive check, which is deliberately not
 * the same as red.
 *
 * Deliberately cheaper than the calendar component it is modelled on:
 * - no data fetching — it renders buckets the caller already computed;
 * - no per-cell mount animation (that variant spun up one motion component per
 *   day, which is hundreds of subscriptions for a static picture);
 * - one hover state, updated only when the pointer enters a different cell, so
 *   moving across the grid re-renders once per cell, not once per mouse event.
 */
const LEVELS = [
  { min: 100, color: '#34d399', label: '100%' },
  { min: 99, color: '#2f9e6b', label: '≥99%' },
  { min: 97, color: '#fbbf24', label: '≥97%' },
  { min: 90, color: '#f97316', label: '≥90%' },
  { min: -1, color: '#f87171', label: '<90%' },
] as const

const EMPTY = 'rgba(255,255,255,0.055)'

function colorFor(uptime: number | null): string {
  if (uptime === null) return EMPTY
  for (const level of LEVELS) {
    if (uptime >= level.min || level.min === -1) return level.color
  }
  return EMPTY
}

const SHAPE: Record<NonNullable<Props['shape']>, string> = {
  square: 'rounded-none',
  rounded: 'rounded-[3px]',
  circle: 'rounded-full',
}

export default function UptimeHeatmap({ buckets, columns = 24, shape = 'rounded', className = '' }: Props) {
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null)

  if (buckets.length === 0) {
    return <p className="py-6 text-center text-[12.5px] text-txt-dim">No checks in this window yet.</p>
  }

  const hovered = hover ? buckets.find((bucket) => bucket.key === hover.key) : null

  return (
    <div className={`relative ${className}`.trim()}>
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))` }}
        onPointerLeave={() => setHover(null)}
      >
        {buckets.map((bucket) => {
          const color = colorFor(bucket.uptime)
          const isHovered = hover?.key === bucket.key
          return (
            <span
              key={bucket.key}
              className={`aspect-square transition-[outline-color,transform] duration-100 ${SHAPE[shape]}`}
              style={{
                backgroundColor: color,
                outline: isHovered ? '1.5px solid rgba(255,255,255,0.75)' : '1.5px solid transparent',
                outlineOffset: isHovered ? '1px' : '0px',
              }}
              onPointerEnter={(event) => {
                if (isHovered) return
                const el = event.currentTarget
                setHover({ key: bucket.key, x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop })
              }}
            >
              <span className="sr-only">
                {bucket.label}: {bucket.uptime === null ? 'no conclusive checks' : `${bucket.uptime.toFixed(1)}% uptime`}
              </span>
            </span>
          )
        })}
      </div>

      {hovered && hover && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-white/10 bg-[#16191e] px-2 py-1 text-[11.5px] leading-tight text-txt-hi shadow-xl"
          style={{ left: hover.x, top: hover.y - 6 }}
          role="status"
        >
          <span className="font-medium">{hovered.label}</span>
          <span className="mx-1.5 text-txt-dim">·</span>
          {hovered.uptime === null ? (
            <span className="text-txt-lo">no evidence</span>
          ) : (
            <span className="font-semibold" style={{ color: colorFor(hovered.uptime) }}>
              {hovered.uptime.toFixed(1)}%
            </span>
          )}
          <span className="ml-1.5 text-txt-dim">
            {hovered.conclusive}/{hovered.checks} checks
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-txt-lo">
        <span className="text-txt-dim">Less</span>
        {LEVELS.map((level) => (
          <span key={level.label} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 ${SHAPE[shape]}`} style={{ backgroundColor: level.color }} />
            {level.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 ${SHAPE[shape]}`} style={{ backgroundColor: EMPTY }} />
          no evidence
        </span>
      </div>
    </div>
  )
}

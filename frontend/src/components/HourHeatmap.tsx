import { Fragment, useEffect, useRef, useState } from 'react'
import { LATENCY_LEVELS, fmtUtcDay, hourGrid, latencyColor, type HourCell } from '../lib/format'
import HoverCard, { HoverRow as Row } from './HoverCard'

export interface HeatmapBucket {
  key: string
  /** Human label for the bucket, e.g. "14:00 UTC". */
  label: string
  /** Conclusive uptime for the bucket, or null when nothing was conclusive —
   *  "no evidence" is not "0%". */
  uptime: number | null
  checks: number
  conclusive: number
  /** Latency percentiles of the bucket's successful checks, null without one. */
  p50: number | null
  p95: number | null
}

interface Props {
  buckets: HeatmapBucket[]
  metric: 'uptime' | 'latency'
  /** The page window [from, now], which the day × hour layout is drawn around. */
  from: number
  now: number
  /** The average-latency target the latency ramp is relative to. */
  target: number
  /** 5-minute buckets (the 1h window): one row of them instead of day × hour. */
  fine?: boolean
  className?: string
}

/**
 * Day × hour heatmap of the page window: a row per UTC date, a column per UTC
 * hour, so a column always means the same hour of the day. Uptime runs green →
 * red; latency is relative to the average target and never red, since slow is
 * not down. Grey means no evidence for that hour, hollow means outside the
 * window, which is a different claim.
 *
 * Deliberately cheap: it renders buckets the caller already computed, has no
 * per-cell animation, and re-renders only when the pointer enters another cell.
 */
const UPTIME_LEVELS = [
  { min: 100, color: '#34d399', label: '100%' },
  { min: 99, color: '#2f9e6b', label: '≥99%' },
  { min: 97, color: '#fbbf24', label: '≥97%' },
  { min: 90, color: '#f97316', label: '≥90%' },
  { min: -1, color: '#f87171', label: '<90%' },
] as const

const EMPTY = 'rgba(255,255,255,0.055)'
const OUTSIDE = 'inset 0 0 0 1px rgba(255,255,255,0.09)'
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

const uptimeColor = (uptime: number) => (UPTIME_LEVELS.find((level) => uptime >= level.min) ?? UPTIME_LEVELS[4]).color
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16)
const shortDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

type Cell = HourCell<HeatmapBucket>

function fill(cell: Cell, metric: Props['metric'], target: number) {
  const bucket = cell.bucket
  if (!bucket) return EMPTY
  if (metric === 'uptime') return bucket.uptime == null ? EMPTY : uptimeColor(bucket.uptime)
  return bucket.p50 == null ? EMPTY : latencyColor(bucket.p50, target)
}

function spoken(cell: Cell, metric: Props['metric'], span: number) {
  const when = `${hhmm(cell.start)} to ${hhmm(cell.start + span)} UTC, ${fmtUtcDay(new Date(cell.start).toISOString().slice(0, 10))}`
  const bucket = cell.bucket
  if (!cell.inWindow) return `${when}: outside the window`
  if (!bucket) return `${when}: no checks`
  if (metric === 'uptime') return `${when}: ${bucket.uptime == null ? 'no conclusive checks' : `${bucket.uptime.toFixed(1)}% uptime`}`
  return `${when}: ${bucket.p50 == null ? 'no successful checks' : `p50 ${Math.round(bucket.p50)} ms`}`
}

function HourCard({ cell, metric, span, anchor, leaving }: { cell: Cell; metric: Props['metric']; span: number; anchor: DOMRect; leaving: boolean }) {
  const bucket = cell.bucket
  return (
    <HoverCard anchor={anchor} leaving={leaving}>
      <div className="flex items-center gap-2">
        <span className="font-mono tabular-nums text-txt-hi">
          {hhmm(cell.start)}–{hhmm(cell.start + span)} UTC
        </span>
        <span className="ml-auto text-txt-mid">{shortDay(new Date(cell.start).toISOString().slice(0, 10))}</span>
      </div>
      <div className="my-1.5 h-px bg-white/[0.06]" />
      {!cell.inWindow ? (
        <p className="text-txt-lo">Outside this window</p>
      ) : !bucket ? (
        <p className="text-txt-lo">No checks</p>
      ) : (
        <dl className="space-y-1">
          {metric === 'uptime' ? (
            <Row label="Uptime">
              {bucket.uptime == null ? (
                <span className="text-txt-lo">no evidence</span>
              ) : (
                <span style={{ color: uptimeColor(bucket.uptime) }}>{bucket.uptime.toFixed(1)}%</span>
              )}
            </Row>
          ) : bucket.p50 == null ? (
            <p className="text-txt-lo">No successful checks</p>
          ) : (
            <>
              <Row label="p50">{Math.round(bucket.p50)} ms</Row>
              <Row label="p95">{bucket.p95 == null ? '—' : `${Math.round(bucket.p95)} ms`}</Row>
            </>
          )}
          <Row label="Checks">{metric === 'uptime' ? `${bucket.conclusive} / ${bucket.checks}` : bucket.checks}</Row>
        </dl>
      )}
    </HoverCard>
  )
}

export default function HourHeatmap({ buckets, metric, from, now, target, fine = false, className = '' }: Props) {
  const [hover, setHover] = useState<{ cell: Cell; rect: DOMRect } | null>(null)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef(0)

  useEffect(() => {
    if (!hover) return
    // The card sits in viewport coordinates, which any scroll or resize makes stale.
    const close = () => setHover(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [hover])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (buckets.length === 0) {
    return <p className="py-6 text-center text-[12.5px] text-txt-dim">No checks in this window yet.</p>
  }

  const span = fine ? 5 * 60_000 : 3_600_000
  const enter = (cell: Cell, el: HTMLElement) => {
    window.clearTimeout(timer.current)
    if (hover?.cell.start !== cell.start) setHover({ cell, rect: el.getBoundingClientRect() })
    setLeaving(false)
  }
  const leave = () => {
    setLeaving(true)
    timer.current = window.setTimeout(() => setHover(null), 80)
  }

  const square = (cell: Cell) => {
    const hovered = hover?.cell.start === cell.start
    return (
      <span
        key={cell.start}
        className={`${fine ? 'h-9' : 'aspect-square'} rounded-[2px] transition-[outline-color] duration-100 sm:rounded-[3px]`}
        style={{
          backgroundColor: cell.inWindow ? fill(cell, metric, target) : 'transparent',
          boxShadow: cell.inWindow ? undefined : OUTSIDE,
          outline: hovered ? '1.5px solid rgba(255,255,255,0.75)' : '1.5px solid transparent',
          outlineOffset: hovered ? '1px' : '0px',
        }}
        onPointerEnter={(event) => enter(cell, event.currentTarget)}
      >
        <span className="sr-only">{spoken(cell, metric, span)}</span>
      </span>
    )
  }

  const legend =
    metric === 'uptime'
      ? [...UPTIME_LEVELS.map((level) => [level.label, level.color] as const), ['no evidence', EMPTY] as const]
      : [
          ...LATENCY_LEVELS.map(
            (level, i) =>
              [i === 3 ? `> ${Math.round(target * 1.5)} ms` : `≤ ${Math.round(target * level.upTo)} ms`, level.color] as const,
          ),
          ['no successful check', EMPTY] as const,
        ]

  return (
    <div className={`relative ${className}`.trim()}>
      {fine ? (
        // One row however many 5-minute buckets the hour spans (12, or 13 with a partial first one).
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }} onPointerLeave={leave}>
          {buckets.map((bucket) => square({ start: Number(bucket.key), bucket, inWindow: true }))}
        </div>
      ) : (
        <div
          className="grid items-center gap-[3px]"
          style={{ gridTemplateColumns: 'auto repeat(24, minmax(0, 1fr))' }}
          onPointerLeave={leave}
        >
          <span />
          {HOURS.map((hour) => (
            <span key={hour} className="text-center font-mono text-[9.5px] leading-none text-txt-lo">
              {hour % 6 === 0 ? String(hour).padStart(2, '0') : ''}
            </span>
          ))}
          {hourGrid(buckets, from, now).map((row) => (
            <Fragment key={row.date}>
              {/* Day number only on phones, where the label would eat the cells. */}
              <span className="whitespace-nowrap pr-1.5 text-right font-mono text-[10px] text-txt-lo">
                <span className="sm:hidden">{Number(row.date.slice(8))}</span>
                <span className="hidden sm:inline">{shortDay(row.date)}</span>
              </span>
              {row.cells.map(square)}
            </Fragment>
          ))}
        </div>
      )}

      {hover && <HourCard cell={hover.cell} metric={metric} span={span} anchor={hover.rect} leaving={leaving} />}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-txt-lo">
        {metric === 'latency' && (
          <span className="text-txt-lo">
            {fine ? '5-minute' : 'Hourly'} p50 vs {target} ms avg target
          </span>
        )}
        {legend.map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
        {!fine && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ boxShadow: OUTSIDE }} />
            outside window
          </span>
        )}
      </div>
    </div>
  )
}

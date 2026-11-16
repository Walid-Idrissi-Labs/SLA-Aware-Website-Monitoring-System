import { useId, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { STATUS } from '../lib/format'

/**
 * Visual building blocks for bento cards: the figure, and the four chart
 * shapes the dashboard uses. They render into `.mb__visual`, so they inherit
 * the card's padding and take whatever vertical space is left after the title.
 */

/** Figure + trailing note. The note is the "why": a delta, a count, a window. */
export function BentoFigure({
  value,
  note,
  muted,
}: {
  value: ReactNode
  note?: ReactNode
  muted?: boolean
}) {
  return (
    <div className="mb__figure">
      <span className={`mb__figure-value${muted ? ' mb__figure-value--muted' : ''}`}>{value}</span>
      {note && <span className="mb__figure-note">{note}</span>}
    </div>
  )
}

/** Sample size guard: below two points there is nothing to draw, so the caller
 *  gets a flat baseline instead of a misleading spike. */
const normalise = (values: number[]) => {
  if (values.length < 2) return null
  const hi = Math.max(...values)
  const lo = Math.min(...values)
  return { hi, lo, range: hi - lo || 1 }
}

/** Smooth line + gradient fill. `preserveAspectRatio="none"` lets it stretch to
 *  any card size, so the stroke uses non-scaling units to stay 1.5px. */
export function BentoArea({
  values,
  color = STATUS.ok,
  floorAtZero = false,
}: {
  values: number[]
  color?: string
  /** Anchor the bottom of the chart at 0 rather than at the dataset minimum —
   *  right for percentages, wrong for latency. */
  floorAtZero?: boolean
}) {
  const gid = useId()
  const spread = normalise(values)
  const path = spread
    ? (() => {
        const lo = floorAtZero ? 0 : spread.lo
        const range = floorAtZero ? Math.max(spread.hi, 1) : spread.range
        const pts = values.map((v, i) => {
          const x = (i / (values.length - 1)) * 100
          const y = 100 - ((v - lo) / range) * 92 - 4
          return [x, Math.min(96, Math.max(4, y))] as const
        })
        let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i - 1] || pts[i]
          const p1 = pts[i]
          const p2 = pts[i + 1]
          const p3 = pts[i + 2] || p2
          d +=
            ` C ${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(2)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(2)},` +
            ` ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(2)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(2)},` +
            ` ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
        }
        return d
      })()
    : null

  return (
    <div className="mb__plot">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={`ba-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.26" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {path ? (
          <>
            <path d={`${path} L 100 100 L 0 100 Z`} fill={`url(#ba-${gid})`} />
            <path
              d={path}
              stroke={color}
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : (
          <line x1="0" y1="97" x2="100" y2="97" stroke={color} strokeOpacity="0.25" strokeWidth="1.5" />
        )}
      </svg>
    </div>
  )
}

/** Rounded bars, tallest (or explicitly flagged) one highlighted. */
export function BentoBars({
  values,
  color = STATUS.accent,
  peak,
}: {
  values: number[]
  color?: string
  /** Index to highlight. Defaults to the largest value. */
  peak?: number
}) {
  const top = Math.max(...values, 1)
  const hot = peak ?? values.indexOf(Math.max(...values))
  return (
    <div className="flex min-h-[26px] flex-1 items-end gap-[5px]">
      {values.map((v, i) => (
        <span
          key={i}
          className="min-h-[3px] flex-1 rounded-t-[3px] transition-colors"
          style={{
            height: `${Math.max(4, (v / top) * 100)}%`,
            backgroundColor: i === hot ? color : `${color}38`,
          }}
        />
      ))}
    </div>
  )
}

const TONE: Record<string, string> = {
  ok: STATUS.ok,
  crit: STATUS.crit,
  warn: STATUS.warn,
  neutral: STATUS.neutral,
}

/** Grid of small status tiles — one per endpoint. Fixed height so the block
 *  fits the card regardless of how many endpoints or how wide the column is. */
export function BentoTiles({
  items,
}: {
  items: Array<{ key: string; tone: 'ok' | 'crit' | 'warn' | 'neutral'; label?: string }>
}) {
  return (
    <div className="grid grid-cols-6 content-start gap-1.5 overflow-hidden">
      {items.slice(0, 18).map((item) => (
        <span
          key={item.key}
          title={item.label}
          className="h-[18px] rounded-[4px]"
          style={{ backgroundColor: `${TONE[item.tone]}2e`, boxShadow: `inset 0 0 0 1px ${TONE[item.tone]}59` }}
        />
      ))}
    </div>
  )
}

/** Trigger tile + numbered step list, after the reference "automation" card. */
export function BentoSteps({
  header,
  steps,
}: {
  header?: ReactNode
  steps: Array<{ label: string; meta?: string; done?: boolean }>
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {header && (
        <div className="flex flex-none items-center gap-2.5 rounded-[10px] bg-white/[0.035] px-2.5 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
          {header}
        </div>
      )}
      <ol className="flex min-h-0 flex-1 flex-col justify-center gap-[2px] rounded-[10px] bg-white/[0.02] py-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-2.5 px-2.5 py-[3px] text-[12.5px] text-txt-hi">
            <span className="grid h-4 w-4 flex-none place-items-center rounded-full bg-white/[0.1]">
              {step.done && <Check size={10} strokeWidth={3} className="text-txt-hi" />}
            </span>
            <span className="min-w-0 flex-1 truncate">{step.label}</span>
            {step.meta && (
              <span className="flex-none text-[11.5px] text-txt-lo tabular-nums">{step.meta}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Thin horizontal meter, for budget/ratio style metrics. */
export function BentoMeter({ pct, color = STATUS.accent }: { pct: number; color?: string }) {
  return (
    <div className="flex min-h-[26px] flex-1 items-center">
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

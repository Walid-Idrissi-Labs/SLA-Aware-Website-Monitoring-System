import { useMemo } from 'react'
import type { Daily, DailyTally } from '../types'
import { DAY_VERDICT, STATUS, dayVerdict, fmtUtcDay as fmtDay, formatDowntime } from '../lib/format'
import BarStrip from './BarStrip'
import HoverCard, { HoverRow as Row } from './HoverCard'

type Day = DailyTally & ReturnType<typeof dayVerdict>

/** Untracked days are hollow, so they never read as grey "no data". Thin days
 *  (under half their expected checks) are dimmed versions of their colour. */
const TONE = {
  operational: { bar: 'bg-ok/70', on: 'bg-ok', thin: 'bg-ok/30', thinOn: 'bg-ok/60' },
  outage: { bar: 'bg-crit/80', on: 'bg-crit' },
  no_data: { bar: 'bg-white/20', on: 'bg-white/35' },
  untracked: {
    bar: 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]',
    on: 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]',
  },
} as const

const OUTAGE_GLOW = { boxShadow: '0 0 6px -1px rgba(248,113,113,0.7)' }

function barClass(day: Day, active: boolean) {
  if (day.verdict === 'operational' && day.thin) return active ? TONE.operational.thinOn : TONE.operational.thin
  const tone = TONE[day.verdict]
  return active ? tone.on : tone.bar
}

function DayCard({ day, since, now, anchor, leaving }: { day: Day; since: string | null; now: number; anchor: DOMRect; leaving: boolean }) {
  const meta = DAY_VERDICT[day.verdict]
  const today = now < Date.parse(`${day.date}T00:00:00Z`) + 86_400_000
  // One short line, so the card never changes height while gliding along the strip.
  const parts = [today ? 'today so far' : null, day.thin ? 'thin coverage' : null].filter(Boolean)
  const note = parts.length ? `${parts.join(' · ')} · UTC` : 'UTC day'

  return (
    <HoverCard anchor={anchor} leaving={leaving}>
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 flex-none rounded-[1px]" style={{ backgroundColor: meta.color }} />
        <span className="font-medium" style={{ color: meta.color }}>
          {meta.label.toUpperCase()}
        </span>
        <span className="ml-auto font-mono tabular-nums text-txt-mid">{fmtDay(day.date)}</span>
      </div>
      <p className="mt-1 text-txt-mid">{note}</p>
      <div className="my-1.5 h-px bg-white/[0.06]" />
      <dl className="space-y-1">
        {day.verdict === 'untracked' ? (
          <Row label="Tracked since">{since ? fmtDay(since) : 'not yet'}</Row>
        ) : (
          <>
            <Row label="Uptime">{day.uptime != null ? `${day.uptime.toFixed(2)}%` : <span className="text-txt-lo">—</span>}</Row>
            <Row label="Checks">
              {(day.up + day.down).toLocaleString('en-US')} / {day.expected.toLocaleString('en-US')}
            </Row>
            {day.down > 0 && <Row label="Failed">{day.down.toLocaleString('en-US')}</Row>}
            {day.inconclusive > 0 && <Row label="No evidence">{day.inconclusive.toLocaleString('en-US')}</Row>}
          </>
        )}
        {day.outage_sec > 0 && (
          <Row label="Outage">
            <span style={{ color: STATUS.crit }}>{formatDowntime(day.outage_sec)}</span>
          </Row>
        )}
      </dl>
    </HoverCard>
  )
}

/** One bar per UTC day: green operational, red outage, grey no data, hollow
 *  before tracking began. Hovering (or arrowing to) a day opens its card. */
export default function DayStrip({
  daily,
  createdAt,
  now,
  interactive = false,
  size = 'h-2.5 gap-[3px]',
  className,
}: {
  daily: Daily
  createdAt?: string
  /** The page's clock, so today's partial day ages with each poll. */
  now: number
  interactive?: boolean
  size?: string
  className?: string
}) {
  const days: Day[] = useMemo(
    () => daily.days.map((day) => ({ ...day, ...dayVerdict(day, daily.since, createdAt, now) })),
    [daily, createdAt, now],
  )

  const counts = { operational: 0, outage: 0, no_data: 0, untracked: 0 }
  for (const day of days) counts[day.verdict] += 1
  const summary =
    `Last ${days.length} days: ${counts.operational} operational, ${counts.outage} with an outage, ` +
    `${counts.no_data} without data, ${counts.untracked} not tracked`

  return (
    <BarStrip
      items={days}
      slots={days.length}
      keyOf={(day) => day.date}
      barClass={barClass}
      barStyle={(day) => (day.verdict === 'outage' ? OUTAGE_GLOW : undefined)}
      card={(i, anchor, leaving) => <DayCard day={days[i]} since={daily.since} now={now} anchor={anchor} leaving={leaving} />}
      describe={(day) =>
        `${DAY_VERDICT[day.verdict].label} · ${fmtDay(day.date)} UTC${day.outage_sec > 0 ? ` · ${formatDowntime(day.outage_sec)} outage` : ''}`
      }
      label={interactive ? `${summary}. Arrow keys inspect each day.` : summary}
      interactive={interactive}
      size={size}
      className={className}
    />
  )
}

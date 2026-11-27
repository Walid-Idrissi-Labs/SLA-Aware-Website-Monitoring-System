import { useMemo } from 'react'
import { Timer, Activity, Hourglass, Gauge, TrendingUp, TrendingDown } from 'lucide-react'
import RubberSegment from './RubberSegment'
import TrendChart from './TrendChart'
import { STATUS, formatDowntime, incidentEnd, incidentTotals } from '../lib/format'
import type { Incident, ReliabilityMetrics } from '../types'

const DAY_MS = 86_400_000

interface Props {
  incidents: Incident[]
  reliability: ReliabilityMetrics | null
  windowDays: 7 | 30
  onWindowChange: (days: 7 | 30) => void
  /** False when the fetched history does not reach back far enough to compute a
   *  like-for-like previous period. Deltas are then omitted rather than faked. */
  comparisonAvailable: boolean
}

/** A change pill. `worseWhenUp` is the default for incident metrics; pass false
 *  for anything where growth is good. `null` on either side means there is no
 *  value to compare (no resolved incident, no outage), so no change is claimed. */
function Delta({ from, to, worseWhenUp = true }: { from: number | null; to: number | null; worseWhenUp?: boolean }) {
  if (from === null || to === null || (from === 0 && to === 0)) return <span className="text-[11.5px] text-txt-dim">—</span>
  if (from === 0) {
    return (
      <span
        className="inline-flex items-center rounded-full px-1.5 py-[1px] text-[11px] font-semibold"
        style={{ backgroundColor: `${worseWhenUp ? STATUS.crit : STATUS.ok}22`, color: worseWhenUp ? STATUS.crit : STATUS.ok }}
      >
        new
      </span>
    )
  }
  const pct = ((to - from) / from) * 100
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.5) {
    return <span className="text-[11.5px] text-txt-dim">no change</span>
  }
  const up = pct > 0
  const worse = worseWhenUp ? up : !up
  const color = worse ? STATUS.crit : STATUS.ok
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-[1px] text-[11px] font-semibold tabular-nums"
      style={{ backgroundColor: `${color}22`, color }}
    >
      <Icon size={10} strokeWidth={2.75} />
      {Math.abs(pct).toFixed(0)}%
    </span>
  )
}

function Row({
  icon,
  label,
  value,
  delta,
}: {
  icon: React.ReactNode
  label: string
  value: string
  delta?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5 py-2 text-[13px]">
      <span className="grid h-4 w-4 flex-none place-items-center text-txt-dim">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-txt-mid">{label}</span>
      <span className="flex-none font-medium tabular-nums text-txt-hi">{value}</span>
      {delta && <span className="w-14 flex-none text-right">{delta}</span>}
    </div>
  )
}

/**
 * Incident report: a downtime-per-day trend, the two headline totals with
 * period-over-period deltas, and the reliability figures underneath.
 *
 * Everything here is derived from the incident list the page already fetched —
 * no extra request, and no number is invented: deltas only appear when the
 * previous period is actually inside the loaded history.
 */
export default function IncidentReport({
  incidents,
  reliability,
  windowDays,
  onWindowChange,
  comparisonAvailable,
}: Props) {
  const report = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000)
    const windowSec = windowDays * 86_400
    const current = incidentTotals(incidents, nowSec - windowSec, nowSec + 1, nowSec)
    const previous = comparisonAvailable
      ? incidentTotals(incidents, nowSec - windowSec * 2, nowSec - windowSec, nowSec)
      : null

    // Downtime minutes per UTC day across the window.
    const todayMs = Date.now()
    const firstDayMs = Math.floor((todayMs - windowSec * 1000) / DAY_MS) * DAY_MS
    const perDay = new Map<number, number>()
    for (const incident of incidents) {
      const start = Math.max(incident.start_time, nowSec - windowSec)
      const seconds = incidentEnd(incident, nowSec) - start
      if (seconds < 0) continue
      // Attributed to the day it began (or the window's first day); an incident
      // spanning midnight is not split, which is a known simplification.
      const day = Math.floor((start * 1000) / DAY_MS) * DAY_MS
      perDay.set(day, (perDay.get(day) ?? 0) + seconds / 60)
    }
    const labels: string[] = []
    const values: number[] = []
    for (let day = firstDayMs; day <= todayMs; day += DAY_MS) {
      labels.push(new Date(day).toISOString().slice(5, 10))
      values.push(Math.round((perDay.get(day) ?? 0) * 10) / 10)
    }

    return { current, previous, labels, values }
  }, [incidents, windowDays, comparisonAvailable])

  const { current, previous, labels, values } = report
  const budget = reliability?.error_budget

  return (
    <div className="panel-flush mt-3">
      <div className="panel-head">
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold text-txt-hi">Incident report</span>
          <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[11px] font-medium text-txt-mid">
            {windowDays}d
          </span>
        </div>
        <RubberSegment
          items={['7d', '30d']}
          value={`${windowDays}d`}
          onChange={(next) => onWindowChange(Number(next.replace('d', '')) as 7 | 30)}
          size="sm"
          radius={9}
          inset={2}
          trackColor="rgba(255,255,255,0.05)"
          thumbColor="#eceef0"
          textColor="#9aa2ab"
          activeTextColor="#0e1115"
          aria-label="Report window"
        />
      </div>

      <div className="p-4">
        <TrendChart
          labels={labels}
          series={[
            {
              key: 'downtime',
              label: 'Downtime',
              color: STATUS.crit,
              values,
            },
          ]}
          format={(value) => `${Math.round(value)}m`}
          height={168}
          emptyLabel="No recorded downtime in this window"
        />
        <p className="mt-1.5 text-[11.5px] text-txt-lo">
          Downtime minutes per day, attributed to the day the incident began (or the first day shown, if earlier).
        </p>

        <div className="hr-accent my-4" />

        {/* Headline totals */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="text-[12px] text-txt-lo">Incidents</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-[28px] font-semibold leading-none tabular-nums text-txt-hi">
                {current.count}
              </span>
              <Delta from={previous?.count ?? 0} to={current.count} />
            </div>
            <p className="mt-1 text-[11.5px] text-txt-lo">
              {previous
                ? `vs ${previous.count} in the previous ${windowDays} days`
                : 'no comparable earlier period loaded'}
            </p>
          </div>
          <div>
            <span className="text-[12px] text-txt-lo">Total downtime</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-[28px] font-semibold leading-none tabular-nums text-txt-hi">
                {formatDowntime(current.downtime)}
              </span>
              <Delta from={previous?.downtime ?? 0} to={current.downtime} />
            </div>
            <p className="mt-1 text-[11.5px] text-txt-lo">
              {previous
                ? `vs ${formatDowntime(previous.downtime)} in the previous ${windowDays} days`
                : 'no comparable earlier period loaded'}
            </p>
          </div>
        </div>

        <div className="mt-3 divide-y divide-white/[0.05] border-t border-white/[0.05]">
          <Row
            icon={<Timer className="h-3.5 w-3.5" strokeWidth={1.75} />}
            label="Mean time to recover"
            value={current.mttr != null ? formatDowntime(current.mttr) : '—'}
            delta={<Delta from={previous?.mttr ?? null} to={current.mttr} />}
          />
          <Row
            icon={<Activity className="h-3.5 w-3.5" strokeWidth={1.75} />}
            label="Mean time between failures"
            value={current.mtbf != null ? formatDowntime(current.mtbf) : '—'}
            delta={<Delta from={previous?.mtbf ?? null} to={current.mtbf} worseWhenUp={false} />}
          />
          <Row
            icon={<Hourglass className="h-3.5 w-3.5" strokeWidth={1.75} />}
            label="Longest outage"
            value={current.longest > 0 ? formatDowntime(current.longest) : '—'}
            delta={<Delta from={previous?.longest ?? 0} to={current.longest || null} />}
          />
          <Row
            icon={<Gauge className="h-3.5 w-3.5" strokeWidth={1.75} />}
            label="Error budget consumed"
            value={budget ? `${budget.burn_pct.toFixed(0)}%` : '—'}
            delta={
              budget && (
                <span className="text-[11.5px] font-medium" style={{ color: budget.ok ? STATUS.ok : STATUS.crit }}>
                  {budget.ok ? formatDowntime(budget.remaining_sec) : 'over'}
                </span>
              )
            }
          />
        </div>
      </div>
    </div>
  )
}

import type { Project, Check, Daily } from '../types'
import {
  timeAgo,
  uptimeFromChecks,
  VERDICT,
  bareUrl,
  STATUS,
  PROJECT_DEFAULTS,
  type Verdict,
} from '../lib/format'
import StatusStrip from './StatusStrip'
import DayStrip from './DayStrip'
import { BentoArea, BentoFigure } from './BentoVisuals'

interface Props {
  project: Project
  checks: Check[]
  /** The monitor's verdict right now (`verdictFor`). */
  verdict: Verdict
  /** The last 14 UTC days, when the API sends them. */
  daily?: Daily
  /** The page's clock (see Dashboard). */
  now: number
}

/**
 * Endpoint card body, in the bento language: figure and note, then the data
 * visual, then the name and URL. Draws no frame — the grid owns the surface,
 * the spotlight and the click target.
 */
export default function ProjectCard({ project, checks, verdict, daily, now }: Props) {
  const current = verdict === 'up' || verdict === 'down'
  const latency = project.last_latency_ms
  const threshold = project.thresholds?.max_avg_latency_ms ?? PROJECT_DEFAULTS.max_avg_latency_ms
  const uptime = uptimeFromChecks(checks)
  const overThreshold = latency != null && latency > threshold

  // Inconclusive checks record a synthetic latency; plotting it would invent a
  // measurement nobody observed.
  const latencyValues = [...checks]
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter((c) => c.status !== 'inconclusive' && c.latency_ms != null)
    .map((c) => c.latency_ms)

  // Only a current verdict may colour the chart: old or missing evidence stays neutral.
  const color = !current ? STATUS.neutral : verdict === 'down' ? STATUS.crit : overThreshold ? STATUS.warn : STATUS.ok

  const note = [
    uptime !== null ? `${uptime.toFixed(1)}% uptime` : null,
    project.last_checked_at ? `checked ${timeAgo(project.last_checked_at)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="mb__body">
      <div className="mb__visual">
        <BentoFigure
          value={
            latency != null ? (
              <>
                {latency}
                <span className="ml-1 text-[13px] font-medium text-txt-lo">ms</span>
              </>
            ) : (
              '—'
            )
          }
          note={note || (verdict === 'stale' ? 'never checked' : 'awaiting first check')}
          muted={!current}
        />
        <BentoArea values={latencyValues} color={color} />
      </div>

      {/* Two scales, so the strips differ in shape: minutes above, days below. */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <StatusStrip checks={checks} bars={44} className="min-w-0 flex-1" />
          <span className="w-6 flex-none text-right font-mono text-[9.5px] text-txt-lo">44m</span>
        </div>
        {daily && (
          <div className="flex items-center gap-2">
            <DayStrip daily={daily} createdAt={project.created_at} now={now} className="min-w-0 flex-1" />
            <span className="w-6 flex-none text-right font-mono text-[9.5px] text-txt-lo">{daily.days.length}d</span>
          </div>
        )}
      </div>

      <div className="mb__text">
        <h3 className="mb__title flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 flex-none rounded-full"
            style={{ backgroundColor: VERDICT[verdict].color ?? STATUS.neutral }}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate">{project.name}</span>
          <span className="ml-auto flex-none text-[11.5px] font-medium" style={{ color: VERDICT[verdict].color }}>
            {VERDICT[verdict].short}
          </span>
        </h3>
        <p className="mb__desc truncate">{bareUrl(project.url)}</p>
      </div>
    </div>
  )
}

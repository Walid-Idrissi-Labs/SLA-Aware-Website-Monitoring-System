import type { Project, Check } from '../types'
import {
  timeAgo,
  uptimeFromChecks,
  verdictFromStatus,
  VERDICT,
  bareUrl,
  STATUS,
  PROJECT_DEFAULTS,
} from '../lib/format'
import StatusStrip from './StatusStrip'
import { BentoArea, BentoFigure } from './BentoVisuals'

interface Props {
  project: Project
  checks: Check[]
}

/**
 * Endpoint card body, in the bento language: figure and note, then the data
 * visual, then the name and URL. Draws no frame — the grid owns the surface,
 * the spotlight and the click target.
 */
export default function ProjectCard({ project, checks }: Props) {
  const verdict = verdictFromStatus(project.current_status)
  const isDown = verdict === 'down'
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

  const color = isDown ? STATUS.crit : overThreshold ? STATUS.warn : STATUS.ok

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
          note={note || 'awaiting first check'}
        />
        <BentoArea values={latencyValues} color={color} />
      </div>

      <StatusStrip checks={checks} bars={44} />

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

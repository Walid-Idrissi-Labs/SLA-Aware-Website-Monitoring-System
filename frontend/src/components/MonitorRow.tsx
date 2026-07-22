import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { Project, Check } from '../types'
import { timeAgo, uptimeFromChecks, bareUrl, PROJECT_DEFAULTS } from '../lib/format'
import { StatusDot } from './ui'
import StatusStrip from './StatusStrip'

interface Props {
  project: Project
  checks: Check[]
}

/**
 * One row in the monitors list. Column widths must stay in sync with
 * MonitorListHeader below.
 */
export default function MonitorRow({ project, checks }: Props) {
  // Three states: up, down, or pending (created moments ago, no checks yet).
  const state =
    project.current_status === 'success' ? 'up' : project.current_status === 'failure' ? 'down' : 'pending'
  const latency = project.last_latency_ms
  const threshold = project.thresholds?.max_avg_latency_ms ?? PROJECT_DEFAULTS.max_avg_latency_ms
  const uptime = uptimeFromChecks(checks)
  const overThreshold = latency != null && latency > threshold

  const dotTone = state === 'up' ? 'ok' : state === 'down' ? 'crit' : 'muted'
  const stateLabel = state === 'up' ? 'Operational' : state === 'down' ? 'Down' : 'Pending'

  return (
    <Link
      to={`/projects/${project.project_id}`}
      className="group flex items-center gap-4 px-5 py-3.5 transition-colors duration-100 hover:bg-soft/50"
    >
      <StatusDot tone={dotTone} pulse={state === 'down'} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-txt-hi">{project.name}</span>
          {state === 'down' && (
            <span className="rounded-full border border-crit/30 bg-crit/10 px-1.5 py-px text-[10.5px] font-medium text-crit">
              Down
            </span>
          )}
        </div>
        <span className="mt-0.5 block truncate font-mono text-[11.5px] text-txt-lo">{bareUrl(project.url)}</span>
      </div>

      <div className="hidden w-44 shrink-0 md:block">
        {checks.length > 0 ? (
          <StatusStrip checks={checks} bars={30} />
        ) : (
          <span className="text-[11.5px] text-txt-faint">
            {state === 'pending' ? 'First check runs within a minute' : 'No recent checks'}
          </span>
        )}
      </div>

      <div className="tnum hidden w-20 shrink-0 text-right text-[13px] sm:block">
        {uptime !== null ? (
          <span className={uptime < 100 ? 'text-warn' : 'text-txt-hi'}>{uptime.toFixed(1)}%</span>
        ) : (
          <span className="text-txt-faint">—</span>
        )}
      </div>

      <div className="tnum w-20 shrink-0 text-right text-[13px]">
        {latency != null ? (
          <span className={overThreshold ? 'text-warn' : 'text-txt-hi'}>
            {latency}
            <span className="ml-0.5 text-[11px] text-txt-lo">ms</span>
          </span>
        ) : (
          <span className="text-txt-faint">—</span>
        )}
      </div>

      <div className="hidden w-24 shrink-0 text-right text-[12.5px] text-txt-lo lg:block">
        {project.last_checked_at ? `${timeAgo(project.last_checked_at)} ago` : stateLabel}
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-txt-faint transition-colors group-hover:text-txt-mid" strokeWidth={1.75} />
    </Link>
  )
}

/** Column captions for the monitors list — widths mirror MonitorRow. */
export function MonitorListHeader() {
  return (
    <div className="flex items-center gap-4 border-b border-edge px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.05em] text-txt-lo">
      <span className="w-2 shrink-0" />
      <span className="flex-1">Monitor</span>
      <span className="hidden w-44 shrink-0 md:block">Recent checks</span>
      <span className="hidden w-20 shrink-0 text-right sm:block">Uptime 1h</span>
      <span className="w-20 shrink-0 text-right">Response</span>
      <span className="hidden w-24 shrink-0 text-right lg:block">Checked</span>
      <span className="w-4 shrink-0" />
    </div>
  )
}

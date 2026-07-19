import { Link } from 'react-router-dom'
import { ArrowUpRight, CircleCheck, CircleAlert } from 'lucide-react'
import type { Project, Check } from '../types'
import { timeAgo, uptimeFromChecks, bareUrl } from '../lib/format'
import StatusStrip from './StatusStrip'
import Sparkline from './Sparkline'

interface Props {
  project: Project
  checks: Check[]
  index?: number
}

export default function ProjectCard({ project, checks, index = 0 }: Props) {
  const isUp = (project.current_status || 'failure') === 'success'
  const latency = project.last_latency_ms
  const threshold = project.thresholds?.max_avg_latency_ms ?? 300
  const uptime = uptimeFromChecks(checks)
  const latencyValues = [...checks].sort((a, b) => a.timestamp - b.timestamp).map((c) => c.latency_ms)
  const overThreshold = latency !== undefined && latency > threshold

  return (
    <Link
      to={`/projects/${project.project_id}`}
      className={`panel group relative flex flex-col overflow-hidden p-4 transition-all duration-200 animate-fade-up hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-panel-hover ${
        isUp ? '' : 'border-crit/25'
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* down-state gradient wash */}
      {!isUp && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-crit/[0.09] via-crit/[0.02] to-transparent" />
      )}

      {/* Header */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`flex items-center gap-1.5 ${isUp ? 'text-ok' : 'text-crit'}`}>
            {isUp ? (
              <CircleCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
            ) : (
              <CircleAlert className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider">
              {isUp ? 'Operational' : 'Down'}
            </span>
          </div>
          <h3 className="mt-2 truncate font-display text-[15px] font-semibold text-txt-hi transition-colors group-hover:text-accent">
            {project.name}
          </h3>
          <p className="truncate font-mono text-[11px] text-txt-lo">{bareUrl(project.url)}</p>
        </div>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/[0.06] text-txt-dim transition-all group-hover:border-accent/40 group-hover:text-accent">
          <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
        </span>
      </div>

      {/* Metrics row */}
      <div className="relative mt-4 flex items-end justify-between">
        <div>
          <span className="micro">Latency</span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className={`data text-[24px] font-bold leading-none ${overThreshold ? 'text-warn' : 'text-txt-hi'}`}>
              {latency !== undefined ? latency : '—'}
            </span>
            <span className="data text-[11px] text-txt-lo">ms</span>
          </div>
        </div>
        <div className="text-right">
          <span className="micro">Uptime · 1h</span>
          <div className="mt-1 data text-[15px] font-semibold text-txt-mid">
            {uptime !== null ? `${uptime.toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>

      {/* Latency sparkline */}
      <div className="relative mt-3">
        {latencyValues.length >= 2 ? (
          <Sparkline
            values={latencyValues}
            color={overThreshold ? '#fbbf24' : isUp ? '#fa5c29' : '#f87171'}
            width={280}
            height={30}
            className="w-full"
          />
        ) : (
          <div className="flex h-[30px] items-center font-mono text-[10px] text-txt-dim">Awaiting data…</div>
        )}
      </div>

      {/* Uptime bar strip */}
      <div className="relative mt-3">
        <StatusStrip checks={checks} bars={44} />
      </div>

      {/* Footer */}
      <div className="relative mt-3 flex items-center justify-between border-t border-white/[0.05] pt-3 font-mono text-[10px] text-txt-lo">
        <span className="flex items-center gap-1.5">
          <span className="text-txt-dim">CHK</span>
          {project.last_checked_at ? timeAgo(project.last_checked_at) : '—'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-txt-dim">SLA</span>
          ≤{threshold}ms
        </span>
      </div>
    </Link>
  )
}

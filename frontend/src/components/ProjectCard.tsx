import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
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
      className="panel group relative flex flex-col overflow-hidden p-4 transition-all duration-200 animate-fade-up hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-panel-hover"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* status accent rail */}
      <span
        className={`absolute inset-y-0 left-0 w-[3px] ${isUp ? 'bg-ok/70' : 'bg-crit'}`}
        style={isUp ? undefined : { boxShadow: '0 0 12px 0 rgba(248,113,113,0.6)' }}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 pl-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`led ${isUp ? 'led-ok' : 'led-crit animate-breathe'}`} />
            <span
              className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
                isUp ? 'text-ok' : 'text-crit'
              }`}
            >
              {isUp ? 'Operational' : 'Down'}
            </span>
          </div>
          <h3 className="mt-2 truncate font-display text-[15px] font-semibold text-txt-hi transition-colors group-hover:text-accent">
            {project.name}
          </h3>
          <p className="truncate font-mono text-[11px] text-txt-lo">{bareUrl(project.url)}</p>
        </div>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/[0.06] text-txt-dim transition-all group-hover:border-accent/40 group-hover:text-accent">
          <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>

      {/* Metrics row */}
      <div className="mt-4 flex items-end justify-between pl-1.5">
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
      <div className="mt-3 pl-1.5">
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
      <div className="mt-3 pl-1.5">
        <StatusStrip checks={checks} bars={44} />
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pl-1.5 pt-3 font-mono text-[10px] text-txt-lo">
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

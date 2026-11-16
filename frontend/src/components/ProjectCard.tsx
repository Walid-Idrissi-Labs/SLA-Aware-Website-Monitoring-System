import { ArrowUpRight, CircleCheck, CircleAlert, CircleDashed } from 'lucide-react'
import type { Project, Check } from '../types'
import {
  timeAgo,
  uptimeFromChecks,
  evidenceFromChecks,
  verdictFromStatus,
  VERDICT,
  bareUrl,
  STATUS,
  PROJECT_DEFAULTS,
} from '../lib/format'
import StatusStrip from './StatusStrip'
import Sparkline from './Sparkline'

interface Props {
  project: Project
  checks: Check[]
}

/**
 * Endpoint cell content. Draws no frame of its own — the bento grid supplies
 * the surface, the spotlight and the rim, and owns the click target.
 */
export default function ProjectCard({ project, checks }: Props) {
  // Four states: up, down, no evidence (challenged/blocked), or pending.
  const verdict = verdictFromStatus(project.current_status)
  const isDown = verdict === 'down'
  const latency = project.last_latency_ms
  const threshold = project.thresholds?.max_avg_latency_ms ?? PROJECT_DEFAULTS.max_avg_latency_ms
  const uptime = uptimeFromChecks(checks)
  const evidence = evidenceFromChecks(checks)
  const latencyValues = [...checks].sort((a, b) => a.timestamp - b.timestamp).map((c) => c.latency_ms)
  const overThreshold = latency != null && latency > threshold

  const badge = {
    up: { classes: VERDICT.up.textClass, Icon: CircleCheck, label: VERDICT.up.label },
    down: { classes: VERDICT.down.textClass, Icon: CircleAlert, label: VERDICT.down.label },
    inconclusive: {
      classes: VERDICT.inconclusive.textClass,
      Icon: CircleDashed,
      label: VERDICT.inconclusive.label,
    },
    pending: { classes: VERDICT.pending.textClass, Icon: CircleDashed, label: VERDICT.pending.label },
  }[verdict]

  return (
    <div className="flex h-full flex-col p-4">
      {isDown && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-crit/[0.1] to-transparent" />
      )}

      {/* Header */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`flex items-center gap-1.5 ${badge.classes}`}>
            <badge.Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider">{badge.label}</span>
          </div>
          <h3 className="mt-1.5 truncate font-display text-[15px] font-semibold text-txt-hi">{project.name}</h3>
          <p className="truncate font-mono text-[11px] text-txt-lo">{bareUrl(project.url)}</p>
        </div>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/[0.06] text-txt-dim group-hover:border-accent/40 group-hover:text-accent">
          <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
        </span>
      </div>

      {/* Metrics */}
      <div className="relative mt-auto flex items-end justify-between pt-3">
        <div>
          <span className="micro">Latency</span>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className={`data text-[22px] font-bold leading-none ${overThreshold ? 'text-warn' : 'text-txt-hi'}`}>
              {latency != null ? latency : '—'}
            </span>
            <span className="data text-[10px] text-txt-lo">ms</span>
          </div>
        </div>
        <div className="text-right">
          <span className="micro">Uptime · 1h</span>
          <div className="mt-0.5 data text-[14px] font-semibold text-txt-mid">
            {uptime !== null ? `${uptime.toFixed(1)}%` : '—'}
          </div>
          {evidence !== null && evidence < 100 && (
            <div className="font-mono text-[9px] text-txt-dim">{evidence.toFixed(0)}% evidence</div>
          )}
        </div>
      </div>

      {/* Latency sparkline */}
      <div className="relative mt-2">
        {latencyValues.length >= 2 ? (
          <Sparkline
            values={latencyValues}
            color={overThreshold ? STATUS.warn : isDown ? STATUS.crit : STATUS.accent}
            width={280}
            height={26}
            className="h-[26px] w-full"
          />
        ) : (
          <div className="flex h-[26px] items-center font-mono text-[10px] text-txt-dim">
            {verdict === 'pending' ? 'First check runs within a minute' : 'Awaiting data…'}
          </div>
        )}
      </div>

      {/* Uptime strip */}
      <div className="relative mt-2">
        <StatusStrip checks={checks} bars={44} />
      </div>

      {/* Footer */}
      <div className="relative mt-2 flex items-center justify-between border-t border-white/[0.05] pt-2 font-mono text-[10px] text-txt-lo">
        <span className="flex items-center gap-1.5">
          <span className="text-txt-dim">CHK</span>
          {project.last_checked_at ? timeAgo(project.last_checked_at) : '—'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-txt-dim">SLA</span>
          ≤{threshold}ms
        </span>
      </div>
    </div>
  )
}

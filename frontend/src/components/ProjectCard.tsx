import type { Project } from '../types'

function timeAgo(ts: string | number | undefined): string {
  if (!ts) return '—'
  const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts
  const diff = Date.now() - ms
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

interface Props {
  project: Project
}

export default function ProjectCard({ project }: Props) {
  const status = project.current_status || 'failure'
  const isUp = status === 'success'
  const latencyDisplay = project.last_latency_ms !== undefined ? String(project.last_latency_ms) : '—'

  return (
    <div className={`bloomberg-card p-3 relative overflow-hidden rounded-sm group ${isUp ? 'border-l-status-healthy' : 'border-l-status-critical'}`}>
      {isUp ? (
        <div className="absolute top-0 right-0 w-16 h-16 bg-status-healthy/5 rounded-bl-full blur-xl group-hover:bg-status-healthy/10 transition-all" />
      ) : (
        <div className="absolute top-0 right-0 w-16 h-16 bg-status-critical/5 rounded-bl-full blur-xl group-hover:bg-status-critical/10 transition-all" />
      )}

      <div className="flex justify-between items-start mb-3 relative z-10">
        <div className="overflow-hidden">
          <h3 className="text-[13px] font-bold text-on-surface truncate uppercase tracking-tight font-mono">{project.name}</h3>
          <p className="text-[9px] font-mono text-on-surface-variant truncate opacity-80">{project.url.replace(/^https?:\/\//, '')}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isUp ? (
            <span className="status-pill bg-status-healthy/10 text-status-healthy border border-status-healthy/30 shadow-[0_0_8px_rgba(74,222,128,0.2)]">UP</span>
          ) : (
            <span className="status-pill bg-status-critical/20 text-status-critical border border-status-critical/30 shadow-[0_0_8px_rgba(248,113,113,0.4)]">DOWN</span>
          )}
        </div>
      </div>

      <div className="space-y-2 mb-3 relative z-10">
        <div className="flex justify-between items-end border-b border-outline-variant/10 pb-1">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Latency</span>
          <span className="metric-value text-base text-on-surface group-hover:text-theme-orange transition-colors">
            {latencyDisplay}<small className="text-[9px] ml-0.5 uppercase text-on-surface-variant">ms</small>
          </span>
        </div>
        <div className="flex justify-between items-end border-b border-outline-variant/10 pb-1">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Wk Uptime</span>
          <span className="metric-value text-base text-on-surface">—<small className="text-[9px] ml-0.5">%</small></span>
        </div>
      </div>

      <div className="flex justify-between items-center pt-1 border-t border-outline-variant/20 mt-2 relative z-10">
        <div className="flex items-center gap-1.5 text-[9px] font-bold text-on-surface-variant uppercase font-mono">
          <span className={`w-1.5 h-1.5 rounded-full ${isUp ? 'bg-status-healthy glow-healthy animate-pulse' : 'bg-status-critical glow-critical animate-pulse'}`}></span>
          {project.last_checked_at ? timeAgo(project.last_checked_at) : 'No data'}
        </div>
        <div className="flex gap-2">
          <span className="material-symbols-outlined text-[14px] cursor-pointer text-on-surface-variant hover:text-theme-orange transition-colors">show_chart</span>
          <span className="material-symbols-outlined text-[14px] cursor-pointer text-on-surface-variant hover:text-theme-orange transition-colors">more_horiz</span>
        </div>
      </div>
    </div>
  )
}
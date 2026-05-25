import { Link } from 'react-router-dom'
import type { Project, Check } from '../types'

function timeAgo(ts: string | number | undefined): string {
  if (!ts) return '—'
  const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts
  const diff = Date.now() - ms
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function MiniSparkline({ checks }: { checks: Check[] }) {
  if (checks.length < 2) return null
  const sorted = [...checks].sort((a, b) => a.timestamp - b.timestamp)
  const values = sorted.map((c) => c.latency_ms)
  const max = Math.max(...values, 100)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const width = 112
  const height = 24
  const padding = 2

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = padding + (1 - (v - min) / range) * (height - padding * 2)
    return `${x},${y}`
  })

  const last = sorted[sorted.length - 1]
  const strokeColor = last.status === 'failure' ? '#f87171' : '#4ade80'

  return (
    <svg className="w-28 h-6" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={`M${points.join(' L')}`} fill="none" stroke={strokeColor} strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

interface Props {
  project: Project
  checks: Check[]
}

export default function ProjectCard({ project, checks }: Props) {
  const status = project.current_status || 'failure'
  const isUp = status === 'success'
  const latencyDisplay = project.last_latency_ms !== undefined ? String(project.last_latency_ms) : '—'
  const threshold = project.thresholds?.max_avg_latency_ms ?? 300

  return (
    <tr className="hover:bg-[#0f0f12] transition-colors cursor-pointer group">
      <td className="px-3 py-2">
        <Link to={`/projects/${project.project_id}`} className="flex items-center gap-2">
          <span className={`w-1 h-8 ${isUp ? 'bg-[#4ade80]' : 'bg-[#f87171]'}`} />
          <div>
            <p className="text-[11px] font-bold text-[#d4d4d8] uppercase tracking-tight group-hover:text-[#fa5c29] transition-colors">
              {project.name}
            </p>
            <p className="text-[9px] text-[#3f3f46]">{project.url.replace(/^https?:\/\//, '')}</p>
          </div>
        </Link>
      </td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold ${isUp ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
          <span className={`w-1.5 h-1.5 ${isUp ? 'bg-[#4ade80]' : 'bg-[#f87171] animate-pulse'}`} />
          {isUp ? 'UP' : 'DOWN'}
        </span>
      </td>
      <td className="px-3 py-2 text-right text-[11px] font-bold text-[#d4d4d8]">
        {latencyDisplay}
        <span className="text-[#3f3f46] text-[9px]">ms</span>
      </td>
      <td className="px-3 py-2 text-right text-[11px] font-bold text-[#d4d4d8]">
        —<span className="text-[#3f3f46] text-[9px]">%</span>
      </td>
      <td className="px-3 py-2">
        <MiniSparkline checks={checks} />
      </td>
      <td className="px-3 py-2 text-right text-[10px] text-[#3f3f46]">{threshold}ms</td>
      <td className="px-3 py-2 text-right text-[10px] text-[#3f3f46]">
        {project.last_checked_at ? timeAgo(project.last_checked_at) : '—'}
      </td>
      <td className="px-3 py-2">
        <Link to={`/projects/${project.project_id}`}>
          <svg
            className="w-3 h-3 text-[#27272a] group-hover:text-[#fa5c29] transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </Link>
      </td>
    </tr>
  )
}
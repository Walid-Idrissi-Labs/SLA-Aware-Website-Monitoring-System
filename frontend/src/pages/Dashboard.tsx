import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Gauge, TriangleAlert, Radar, RefreshCw, Plus } from 'lucide-react'
import Shell from '../components/Shell'
import TickerStat from '../components/TickerStat'
import StatCard from '../components/StatCard'
import ProjectCard from '../components/ProjectCard'
import AddProjectModal from '../components/AddProjectModal'
import MagicBento, { type MagicBentoItem } from '../components/MagicBento'
import { Alert } from '../components/ui'
import { getProjects, getProjectStatus } from '../lib/api'
import { POLL_INTERVAL_MS, STATUS } from '../lib/format'
import type { Project, ProjectStatus } from '../types'

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [statuses, setStatuses] = useState<Record<string, ProjectStatus>>({})
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const requestSeq = useRef(0)
  const navigate = useNavigate()

  const loadProjects = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    try {
      const data = await getProjects()
      const results = await Promise.allSettled(data.map((p) => getProjectStatus(p.project_id, 1)))
      if (seq !== requestSeq.current) return // a newer request superseded this one
      const statusMap: Record<string, ProjectStatus> = {}
      results.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          statusMap[data[i].project_id] = res.value
        }
      })
      setProjects(data)
      setStatuses(statusMap)
      setError(null)
      setLoaded(true)
    } catch (e) {
      if (seq !== requestSeq.current) return
      // Keep whatever is already on screen — a failed background poll
      // shouldn't wipe a working dashboard.
      setError(e instanceof Error ? e.message : 'Failed to load projects')
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    const intervalId = window.setInterval(() => loadProjects(), POLL_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [loadProjects])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadProjects()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [loadProjects])

  const activeProjects = projects.filter((p) => p.active)
  const total = activeProjects.length
  // A project with no checks yet is "pending", not down.
  const checked = activeProjects.filter((p) => p.current_status === 'success' || p.current_status === 'failure')
  const healthy = checked.filter((p) => p.current_status === 'success').length
  const withLatency = activeProjects.filter((p) => p.last_latency_ms != null)
  const avgLatency =
    withLatency.length > 0
      ? Math.round(withLatency.reduce((sum, p) => sum + (p.last_latency_ms || 0), 0) / withLatency.length)
      : null
  const incidents = checked.filter((p) => p.current_status === 'failure').length
  const healthPct = checked.length > 0 ? (healthy / checked.length) * 100 : null

  const kpis: MagicBentoItem[] = useMemo(
    () => [
      {
        id: 'health',
        content: (
          <StatCard
            label="System Health"
            value={healthPct}
            decimals={1}
            unit="%"
            icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.75} />}
            accent={healthPct === null || healthPct >= 99 ? STATUS.ok : STATUS.warn}
            sub={checked.length > 0 ? `${healthy} of ${checked.length} responding` : 'no checks yet'}
          />
        ),
      },
      {
        id: 'latency',
        content: (
          <StatCard
            label="Avg Latency"
            value={avgLatency}
            unit="ms"
            icon={<Gauge className="h-4 w-4" strokeWidth={1.75} />}
            sub="across active endpoints"
          />
        ),
      },
      {
        id: 'incidents',
        content: (
          <StatCard
            label="Active Incidents"
            value={incidents}
            icon={<TriangleAlert className="h-4 w-4" strokeWidth={1.75} />}
            accent={incidents > 0 ? STATUS.crit : STATUS.ok}
            sub={incidents > 0 ? 'endpoints failing checks' : 'no failing endpoints'}
          />
        ),
      },
      {
        id: 'endpoints',
        content: (
          <StatCard
            label="Endpoints"
            value={total}
            icon={<Radar className="h-4 w-4" strokeWidth={1.75} />}
            sub="checked every minute"
          />
        ),
      },
    ],
    [healthPct, avgLatency, incidents, total, healthy, checked.length],
  )

  const cards: MagicBentoItem[] = useMemo(
    () =>
      activeProjects.map((project) => ({
        id: project.project_id,
        onClick: () => navigate(`/projects/${project.project_id}`),
        content: <ProjectCard project={project} checks={statuses[project.project_id]?.checks || []} />,
      })),
    [activeProjects, statuses, navigate],
  )

  const ticker = (
    <>
      <TickerStat
        label="Health"
        value={healthPct !== null ? `${healthPct.toFixed(1)}%` : '—'}
        color={healthPct === null ? undefined : healthPct >= 99 ? STATUS.ok : STATUS.warn}
      />
      <TickerStat label="Avg Lat" value={avgLatency !== null ? `${avgLatency}ms` : '—'} />
      <TickerStat label="Incidents" value={String(incidents)} color={incidents > 0 ? STATUS.crit : STATUS.ok} />
      <TickerStat label="Endpoints" value={String(total)} />
    </>
  )

  return (
    <Shell ticker={ticker}>
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker mb-1.5">Operations</p>
          <h1 className="text-sheen font-display text-[26px] font-bold tracking-tight">Overview</h1>
          <p className="mt-1 text-[12px] text-txt-lo">Uptime, latency, and SLA posture across every endpoint.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadProjects} disabled={loading} className="btn-ghost">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin-slow' : ''}`} strokeWidth={1.75} />
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-accent">
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add Endpoint
          </button>
        </div>
      </div>

      {/* KPI bento */}
      <MagicBento
        items={kpis}
        columns={4}
        rowHeight={116}
        gap={10}
        radius={14}
        minCell={150}
        spotlightRadius={260}
        className="mt-6"
      />

      {/* Section header */}
      <div className="mt-8 flex items-center gap-3">
        <h2 className="font-mono text-[12px] font-bold uppercase tracking-micro text-txt-hi">Monitored Endpoints</h2>
        <span className="rounded-md border border-white/[0.08] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-txt-mid">
          {total}
        </span>
        <span className="hr-accent flex-1" />
      </div>

      {/* Content */}
      <div className="mt-4">
        {error && (
          <Alert
            tone="error"
            className="mb-4"
            action={
              <button onClick={loadProjects} className="btn-ghost">
                Retry
              </button>
            }
          >
            {error}
            {loaded && ' — showing the last loaded data.'}
          </Alert>
        )}

        {loading && !loaded && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="panel h-[244px] p-4">
                <div className="skeleton h-3 w-20" />
                <div className="skeleton mt-3 h-4 w-40" />
                <div className="skeleton mt-2 h-3 w-28" />
                <div className="skeleton mt-6 h-8 w-24" />
                <div className="skeleton mt-6 h-8 w-full" />
                <div className="skeleton mt-3 h-6 w-full" />
              </div>
            ))}
          </div>
        )}

        {loaded && activeProjects.length === 0 && (
          <div className="panel flex flex-col items-center justify-center gap-4 py-20 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.02] text-txt-lo">
              <Radar className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <div>
              <p className="font-display text-[15px] font-semibold text-txt-hi">No endpoints yet</p>
              <p className="mt-1 text-[12px] text-txt-lo">Add a website to start checking it every minute.</p>
            </div>
            <button onClick={() => setShowAddModal(true)} className="btn-accent">
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add Endpoint
            </button>
          </div>
        )}

        {cards.length > 0 && (
          <MagicBento items={cards} columns={3} rowHeight={244} gap={10} radius={16} minCell={280} />
        )}
      </div>

      {showAddModal && (
        <AddProjectModal
          onClose={() => setShowAddModal(false)}
          onSuccess={(project) => {
            setShowAddModal(false)
            setProjects((prev) => [...prev, project])
            getProjectStatus(project.project_id, 1)
              .then((status) => setStatuses((prev) => ({ ...prev, [project.project_id]: status })))
              .catch(() => {})
          }}
        />
      )}
    </Shell>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { ShieldCheck, Gauge, TriangleAlert, Radar, RefreshCw, Plus } from 'lucide-react'
import Shell from '../components/Shell'
import TickerStat from '../components/TickerStat'
import StatCard from '../components/StatCard'
import ProjectCard from '../components/ProjectCard'
import AddProjectModal from '../components/AddProjectModal'
import { getProjects, getProjectStatus } from '../lib/api'
import type { Project, ProjectStatus } from '../types'

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [statuses, setStatuses] = useState<Record<string, ProjectStatus>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const loadingRef = useRef(false)

  const loadProjects = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const data = await getProjects()
      setProjects(data)

      const results = await Promise.allSettled(data.map((p) => getProjectStatus(p.project_id, 1)))
      const statusMap: Record<string, ProjectStatus> = {}
      results.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          statusMap[data[i].project_id] = res.value
        }
      })
      setStatuses(statusMap)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects')
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    const intervalId = window.setInterval(() => loadProjects(), 60000)
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
  const healthy = activeProjects.filter((p) => p.current_status === 'success').length
  const withLatency = activeProjects.filter((p) => p.last_latency_ms !== undefined)
  const avgLatency =
    withLatency.length > 0
      ? Math.round(withLatency.reduce((sum, p) => sum + (p.last_latency_ms || 0), 0) / withLatency.length)
      : 0
  const incidents = activeProjects.filter((p) => p.current_status !== 'success').length
  const healthPct = total > 0 ? (healthy / total) * 100 : 0

  const ticker = (
    <>
      <TickerStat label="Health" value={`${healthPct.toFixed(1)}%`} color={healthPct >= 99 ? '#34d399' : '#fbbf24'} />
      <TickerStat label="Avg Lat" value={`${avgLatency}ms`} />
      <TickerStat label="Incidents" value={String(incidents)} color={incidents > 0 ? '#f87171' : '#34d399'} />
      <TickerStat label="Endpoints" value={String(total)} />
    </>
  )

  return (
    <Shell ticker={ticker}>
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="animate-fade-up">
          <p className="kicker mb-1.5">Operations Overview</p>
          <h1 className="text-sheen font-display text-[26px] font-bold tracking-tight">Mission Control</h1>
          <p className="mt-1 text-[12px] text-txt-lo">Real-time uptime, latency, and SLA posture across every endpoint.</p>
        </div>
        <div className="flex items-center gap-2 animate-fade-up" style={{ animationDelay: '80ms' }}>
          <button onClick={loadProjects} disabled={loading} className="btn-ghost">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin-slow' : ''}`} strokeWidth={1.75} />
            {loading ? 'Syncing' : 'Refresh'}
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-accent">
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            New Endpoint
          </button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="System Health"
          value={healthPct}
          decimals={1}
          unit="%"
          icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.75} />}
          accent={healthPct >= 99 ? '#34d399' : '#fbbf24'}
          sub={<span>{healthy} of {total || 0} operational</span>}
          index={0}
        />
        <StatCard
          label="Avg Latency"
          value={avgLatency}
          unit="ms"
          icon={<Gauge className="h-4 w-4" strokeWidth={1.75} />}
          sub={<span>across active endpoints</span>}
          index={1}
        />
        <StatCard
          label="Active Incidents"
          value={incidents}
          icon={<TriangleAlert className="h-4 w-4" strokeWidth={1.75} />}
          accent={incidents > 0 ? '#f87171' : '#34d399'}
          sub={<span>{incidents > 0 ? 'requires attention' : 'all systems nominal'}</span>}
          index={2}
        />
        <StatCard
          label="Endpoints"
          value={total}
          icon={<Radar className="h-4 w-4" strokeWidth={1.75} />}
          sub={<span>monitored every 60s</span>}
          index={3}
        />
      </div>

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
        {loading && projects.length === 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="panel h-[248px] p-4">
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

        {error && (
          <div className="panel flex items-center justify-between gap-4 border-crit/25 bg-crit/[0.04] p-4">
            <div className="flex items-center gap-3">
              <TriangleAlert className="h-4 w-4 shrink-0 text-crit" strokeWidth={1.75} />
              <span className="text-[12px] text-crit">{error}</span>
            </div>
            <button onClick={loadProjects} className="btn-ghost">
              Retry
            </button>
          </div>
        )}

        {!error && !loading && activeProjects.length === 0 && (
          <div className="panel frame-corners flex flex-col items-center justify-center gap-4 py-20 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.02] text-txt-lo">
              <Radar className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <div>
              <p className="font-display text-[15px] font-semibold text-txt-hi">No endpoints configured</p>
              <p className="mt-1 text-[12px] text-txt-lo">Add your first website to begin continuous monitoring.</p>
            </div>
            <button onClick={() => setShowAddModal(true)} className="btn-accent">
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              Add First Endpoint
            </button>
          </div>
        )}

        {!error && activeProjects.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeProjects.map((project, i) => (
              <ProjectCard
                key={project.project_id}
                project={project}
                checks={statuses[project.project_id]?.checks || []}
                index={i}
              />
            ))}
          </div>
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

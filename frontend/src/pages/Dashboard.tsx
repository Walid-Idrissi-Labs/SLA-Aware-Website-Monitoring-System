import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, Plus, RefreshCw } from 'lucide-react'
import Shell from '../components/Shell'
import StatCard from '../components/StatCard'
import MonitorRow, { MonitorListHeader } from '../components/MonitorRow'
import AddProjectModal from '../components/AddProjectModal'
import { Alert } from '../components/ui'
import { getProjects, getProjectStatus } from '../lib/api'
import { POLL_INTERVAL_MS } from '../lib/format'
import type { Project, ProjectStatus } from '../types'

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [statuses, setStatuses] = useState<Record<string, ProjectStatus>>({})
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const requestSeq = useRef(0)

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
  const down = checked.filter((p) => p.current_status === 'failure').length

  return (
    <Shell>
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-txt-hi">Monitors</h1>
          <p className="mt-1 text-[13px] text-txt-mid">Uptime, response time, and SLA posture across your endpoints.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadProjects} disabled={loading} className="btn-secondary">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            Refresh
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add monitor
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 animate-fade-up" style={{ animationDelay: '40ms' }}>
        <StatCard
          label="Operational"
          value={checked.length > 0 ? `${healthy} / ${checked.length}` : null}
          sub={checked.length > 0 ? 'monitors responding' : 'no checks yet'}
        />
        <StatCard label="Avg response" value={avgLatency} unit="ms" sub="latest check, all monitors" />
        <StatCard
          label="Down"
          value={down}
          tone={down > 0 ? 'crit' : 'default'}
          sub={down > 0 ? 'failing right now' : 'all monitors passing'}
        />
        <StatCard label="Monitors" value={total} sub="checked every minute" />
      </div>

      {/* Monitors list */}
      <div className="mt-6 animate-fade-up" style={{ animationDelay: '80ms' }}>
        {error && (
          <Alert
            tone="error"
            className="mb-4"
            action={
              <button onClick={loadProjects} className="btn-secondary btn-compact">
                Retry
              </button>
            }
          >
            {error}
            {loaded && ' — showing the last loaded data.'}
          </Alert>
        )}

        {loading && !loaded && (
          <div className="card overflow-hidden">
            <MonitorListHeader />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-edge/60 px-5 py-4 last:border-0">
                <div className="skeleton h-2 w-2 rounded-full" />
                <div className="flex-1">
                  <div className="skeleton h-3.5 w-40" />
                  <div className="skeleton mt-2 h-3 w-56" />
                </div>
                <div className="skeleton hidden h-5 w-44 md:block" />
                <div className="skeleton h-3.5 w-16" />
              </div>
            ))}
          </div>
        )}

        {loaded && activeProjects.length === 0 && (
          <div className="card flex flex-col items-center justify-center gap-4 py-20 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full border border-edge bg-soft text-txt-lo">
              <Activity className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-[14px] font-semibold text-txt-hi">No monitors yet</p>
              <p className="mt-1 text-[13px] text-txt-mid">Add a website to start checking it every minute.</p>
            </div>
            <button onClick={() => setShowAddModal(true)} className="btn-primary">
              <Plus className="h-4 w-4" strokeWidth={2} />
              Add monitor
            </button>
          </div>
        )}

        {activeProjects.length > 0 && (
          <div className="card divide-y divide-edge/60 overflow-hidden">
            <MonitorListHeader />
            {activeProjects.map((project) => (
              <MonitorRow key={project.project_id} project={project} checks={statuses[project.project_id]?.checks || []} />
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

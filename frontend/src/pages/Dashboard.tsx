import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import TopNav from '../components/TopNav'
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

  async function loadProjects() {
    setLoading(true)
    setError(null)
    try {
      const data = await getProjects()
      setProjects(data)

      const results = await Promise.allSettled(
        data.map((p) => getProjectStatus(p.project_id, 1))
      )
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
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  const activeProjects = projects.filter((p) => p.active)
  const total = activeProjects.length
  const healthy = activeProjects.filter((p) => p.current_status === 'success').length
  const avgLatency =
    total > 0
      ? Math.round(
          activeProjects.reduce((sum, p) => sum + (p.last_latency_ms || 0), 0) /
            Math.max(activeProjects.filter((p) => p.last_latency_ms !== undefined).length, 1)
        )
      : 0
  const incidents = activeProjects.filter((p) => p.current_status !== 'success').length

  return (
    <div className="min-h-screen bg-[#050505] text-[#d4d4d8] flex text-[11px] font-mono">
      <TopNav />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Ticker Bar */}
        <header className="h-9 bg-[#08080a] border-b border-[#1a1a1e] flex items-center px-3 shrink-0">
          <div className="flex items-center gap-1.5 mr-4">
            <span className="text-[9px] font-bold text-[#fa5c29] uppercase tracking-widest">SLA_AWARE</span>
            <span className="text-[#27272a]">|</span>
            <span className="text-[9px] text-[#6b6b73]">MONITOR_v2.4.1</span>
          </div>

          <div className="flex-1 flex items-center gap-5 overflow-hidden">
            <div className="flex items-center gap-1 text-[9px]">
              <span className="text-[#3f3f46] uppercase">SYS_HEALTH</span>
              <span className="text-[#4ade80] font-bold">
                {total > 0 ? ((healthy / total) * 100).toFixed(1) : '0.0'}%
              </span>
            </div>
            <div className="flex items-center gap-1 text-[9px]">
              <span className="text-[#3f3f46] uppercase">AVG_LAT</span>
              <span className="text-[#d4d4d8] font-bold">{avgLatency}ms</span>
            </div>
            <div className="flex items-center gap-1 text-[9px]">
              <span className="text-[#3f3f46] uppercase">ACTIVE_INC</span>
              <span className={`font-bold ${incidents > 0 ? 'text-[#f87171]' : 'text-[#4ade80]'}`}>{incidents}</span>
            </div>
            <div className="flex items-center gap-1 text-[9px]">
              <span className="text-[#3f3f46] uppercase">ENDPOINTS</span>
              <span className="text-[#d4d4d8] font-bold">{total}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[9px] text-[#6b6b73]">
            <span>{new Date().toISOString().split('T')[0]}</span>
            <span className="text-[#fa5c29] font-bold">
              {new Date().toLocaleTimeString('en-US', { hour12: false })} UTC
            </span>
          </div>
        </header>

        <main className="flex-1 p-3 overflow-auto">
          {/* Projects Module */}
          <div className="border border-[#1a1a1e] bg-[#0d0d10] relative">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />

            <div className="relative">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a1a1e] bg-[#08080a]/50">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#fa5c29]" />
                  <span className="text-[10px] font-bold text-[#d4d4d8] uppercase tracking-widest">
                    MONITORED_ENDPOINTS
                  </span>
                  <span className="text-[#27272a]">[{total}]</span>
                </div>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 px-2 py-1 bg-[#fa5c29] text-white text-[10px] font-bold uppercase tracking-wider hover:bg-[#fa5c29]/90 active:scale-[0.97] transition-all"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  NEW
                </button>
              </div>

              {loading && (
                <div className="flex justify-center py-12">
                  <div className="w-5 h-5 border-2 border-[#fa5c29] border-t-transparent animate-spin" />
                </div>
              )}

              {error && (
                <div className="px-3 py-2 border-b border-[#1a1a1e] text-[#f87171] text-[11px]">
                  {error}
                  <button className="ml-3 underline hover:text-white transition-colors" onClick={loadProjects}>
                    Retry
                  </button>
                </div>
              )}

              {!loading && !error && activeProjects.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-[11px] text-[#3f3f46] mb-3">No endpoints configured</p>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#fa5c29] text-white text-[10px] font-bold uppercase tracking-wider hover:bg-[#fa5c29]/90 transition-all"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    ADD FIRST ENDPOINT
                  </button>
                </div>
              )}

              {!loading && !error && activeProjects.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#1a1a1e] bg-[#08080a]/30">
                        <th className="px-3 py-1.5 text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider w-48">
                          Endpoint
                        </th>
                        <th className="px-3 py-1.5 text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider w-20">
                          Status
                        </th>
                        <th className="px-3 py-1.5 text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider w-24 text-right">
                          Latency
                        </th>
                        <th className="px-3 py-1.5 text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider w-24 text-right">
                          Uptime
                        </th>
                        <th className="px-3 py-1.5 text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider w-32">
                          24h Trend
                        </th>
                        <th className="px-3 py-1.5 text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider w-24 text-right">
                          Threshold
                        </th>
                        <th className="px-3 py-1.5 text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider w-20 text-right">
                          Last
                        </th>
                        <th className="px-3 py-1.5 text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a1a1e]/50">
                      {activeProjects.map((project) => (
                        <ProjectCard
                          key={project.project_id}
                          project={project}
                          checks={statuses[project.project_id]?.checks || []}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Status Bar */}
        <div className="h-6 bg-[#08080a] border-t border-[#1a1a1e] flex items-center px-3 text-[9px] text-[#3f3f46] shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-1 h-1 bg-[#4ade80]" />
              CONN_OK
            </span>
            <span>LAT:14ms</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <span>MEM:42%</span>
            <span>CPU:12%</span>
            <span className="text-[#fa5c29] font-bold">● LIVE</span>
          </div>
        </div>
      </div>

      {showAddModal && (
        <AddProjectModal
          onClose={() => setShowAddModal(false)}
          onSuccess={(project) => {
            setShowAddModal(false)
            setProjects((prev) => [...prev, project])
            getProjectStatus(project.project_id, 1)
              .then((status) => {
                setStatuses((prev) => ({ ...prev, [project.project_id]: status }))
              })
              .catch(() => {})
          }}
        />
      )}
    </div>
  )
}
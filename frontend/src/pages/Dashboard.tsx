import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import TopNav from '../components/TopNav'
import ProjectCard from '../components/ProjectCard'
import AddProjectModal from '../components/AddProjectModal'
import { getProjects } from '../lib/api'
import type { Project } from '../types'

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  async function loadProjects() {
    setLoading(true)
    setError(null)
    try {
      const data = await getProjects()
      setProjects(data)
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

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 max-w-container-max mx-auto px-margin-page py-6 w-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-outline-variant/30 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="font-headline-lg text-[28px] tracking-tight text-on-surface uppercase">Projects Overview</h1>
              {activeProjects.length > 0 && (
                <span className="bg-theme-orange/10 text-theme-orange border border-theme-orange/30 px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider glow-orange">
                  {activeProjects.length} ACTIVE
                </span>
              )}
            </div>
            <p className="font-body-md text-[11px] text-on-surface-variant uppercase tracking-wider font-medium font-mono">Real-time infrastructure performance matrix</p>
          </div>
          <div className="flex gap-3">
            <button
              className="flex items-center gap-2 bg-theme-orange text-surface-container-lowest px-4 py-1.5 rounded font-bold text-[12px] hover:bg-theme-orange/90 active:scale-95 transition-all shadow-sm glow-orange font-mono"
              onClick={() => setShowAddModal(true)}
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              NEW PROJECT
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 bg-theme-orange rounded animate-spin flex items-center justify-center">
              <span className="material-symbols-outlined text-surface-container-lowest text-sm">progress_activity</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-error-container border border-error/30 text-error px-4 py-3 rounded font-mono text-sm mb-4">
            {error}
            <button className="ml-4 underline" onClick={loadProjects}>Retry</button>
          </div>
        )}

        {!loading && !error && activeProjects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mb-4 border border-outline-variant">
              <span className="material-symbols-outlined text-3xl text-outline">dns</span>
            </div>
            <h2 className="font-headline-md text-on-surface mb-2">No projects yet</h2>
            <p className="text-sm text-on-surface-variant mb-6 max-w-sm">Add your first endpoint to start monitoring uptime, latency, and SLA compliance.</p>
            <button
              className="flex items-center gap-2 bg-theme-orange text-surface-container-lowest px-6 py-2 rounded font-bold text-sm hover:bg-theme-orange/90 transition-all glow-orange"
              onClick={() => setShowAddModal(true)}
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add Your First Project
            </button>
          </div>
        )}

        {!loading && !error && activeProjects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {activeProjects.map((project) => (
              <Link key={project.project_id} to={`/projects/${project.project_id}`}>
                <ProjectCard project={project} />
              </Link>
            ))}
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-surface-container-low/30 backdrop-blur-sm p-3 border border-dashed border-outline-variant/50 flex flex-col items-center justify-center text-on-surface-variant hover:border-theme-orange hover:text-theme-orange hover:bg-theme-orange/5 cursor-pointer transition-all min-h-[160px] rounded-sm group"
            >
              <div className="w-10 h-10 rounded-full border border-current flex items-center justify-center mb-2 group-hover:shadow-[0_0_15px_rgba(250,92,41,0.2)] transition-shadow">
                <span className="material-symbols-outlined text-[20px]">add</span>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-widest font-mono">Add Metric</p>
              <p className="text-[9px] font-medium opacity-60 font-mono mt-1">Expand Monitor</p>
            </button>
          </div>
        )}
      </main>

      {showAddModal && (
        <AddProjectModal
          onClose={() => setShowAddModal(false)}
          onSuccess={(project) => {
            setShowAddModal(false)
            setProjects((prev) => [...prev, project])
          }}
        />
      )}
    </div>
  )
}
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import TopNav from '../components/TopNav'
import LatencyChart from '../components/LatencyChart'
import { getProject, getProjectStatus, getProjectReports, updateProject, deleteProject } from '../lib/api'
import type { ProjectStatus, ProjectReport, Project, UpdateProjectInput } from '../types'

const SEVERITY_LABELS: Record<string, string> = {
  healthy: 'HEALTHY',
  degraded: 'DEGRADED',
  major: 'MAJOR',
  critical: 'CRITICAL',
}

const SEVERITY_COLORS: Record<string, string> = {
  healthy: 'text-[#4ade80]',
  degraded: 'text-[#fbbf24]',
  major: 'text-[#f97316]',
  critical: 'text-[#f87171]',
}

// ─── Edit Modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  project: Project
  onClose: () => void
  onSaved: (updated: Project) => void
}

function EditModal({ project, onClose, onSaved }: EditModalProps) {
  const [form, setForm] = useState<UpdateProjectInput>({
    name: project.name,
    url: project.url,
    failure_threshold: project.failure_threshold ?? 3,
    notification_email: project.notification_email ?? '',
    thresholds: {
      min_uptime_pct: project.thresholds?.min_uptime_pct ?? 99.9,
      max_avg_latency_ms: project.thresholds?.max_avg_latency_ms ?? 300,
    },
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateProject(project.project_id, form)
      onSaved(updated)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg bg-[#0d0d10] border border-[#1a1a1e] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1e] bg-[#08080a]">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[#fa5c29]" />
            <span className="text-[10px] font-bold text-[#d4d4d8] uppercase tracking-widest">EDIT_PROJECT</span>
          </div>
          <button onClick={onClose} className="text-[#3f3f46] hover:text-[#d4d4d8] transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1">Project_Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-[#08080a] border border-[#1a1a1e] text-[#d4d4d8] px-3 py-2 text-[12px] focus:border-[#fa5c29] focus:outline-none transition-colors"
              placeholder="My Portfolio"
            />
          </div>

          <div>
            <label className="block text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1">Target_URL</label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="w-full bg-[#08080a] border border-[#1a1a1e] text-[#d4d4d8] px-3 py-2 text-[12px] focus:border-[#fa5c29] focus:outline-none transition-colors"
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label className="block text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1">Notification_Email</label>
            <input
              type="email"
              value={form.notification_email}
              onChange={(e) => setForm({ ...form, notification_email: e.target.value })}
              className="w-full bg-[#08080a] border border-[#1a1a1e] text-[#d4d4d8] px-3 py-2 text-[12px] focus:border-[#fa5c29] focus:outline-none transition-colors"
              placeholder="alerts@example.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1">Failure_Threshold</label>
              <input
                type="number"
                min={1}
                max={10}
                value={form.failure_threshold}
                onChange={(e) => setForm({ ...form, failure_threshold: Number(e.target.value) })}
                className="w-full bg-[#08080a] border border-[#1a1a1e] text-[#d4d4d8] px-3 py-2 text-[12px] focus:border-[#fa5c29] focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1">Min_Uptime_%</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={form.thresholds?.min_uptime_pct}
                onChange={(e) =>
                  setForm({
                    ...form,
                    thresholds: { ...form.thresholds!, min_uptime_pct: Number(e.target.value) },
                  })
                }
                className="w-full bg-[#08080a] border border-[#1a1a1e] text-[#d4d4d8] px-3 py-2 text-[12px] focus:border-[#fa5c29] focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1">Max_Latency_MS</label>
            <input
              type="number"
              min={0}
              value={form.thresholds?.max_avg_latency_ms}
              onChange={(e) =>
                setForm({
                  ...form,
                  thresholds: { ...form.thresholds!, max_avg_latency_ms: Number(e.target.value) },
                })
              }
              className="w-full bg-[#08080a] border border-[#1a1a1e] text-[#d4d4d8] px-3 py-2 text-[12px] focus:border-[#fa5c29] focus:outline-none transition-colors"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-[#f87171] text-[11px] border border-[rgba(248,113,113,0.2)] bg-[rgba(248,113,113,0.06)] px-3 py-2">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#1a1a1e] bg-[#08080a]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] font-bold text-[#6b6b73] border border-[#1a1a1e] hover:border-[rgba(250,92,41,0.2)] hover:text-[#d4d4d8] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-[11px] font-bold bg-[#fa5c29] hover:bg-[#fa5c29]/90 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {saving ? 'Saving...' : 'Save_Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ──────────────────────────────────────────────────────

interface DeleteModalProps {
  projectName: string
  onClose: () => void
  onConfirm: () => void
  deleting: boolean
}

function DeleteModal({ projectName, onClose, onConfirm, deleting }: DeleteModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !deleting) onClose()
      }}
    >
      <div className="w-full max-w-sm bg-[#0d0d10] border border-[rgba(248,113,113,0.2)] shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(248,113,113,0.15)] bg-[rgba(248,113,113,0.04)]">
          <svg className="w-4 h-4 text-[#f87171]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span className="text-[10px] font-bold text-[#f87171] uppercase tracking-widest">CONFIRM_DELETE</span>
        </div>

        <div className="px-4 py-4 space-y-2">
          <p className="text-[12px] text-[#d4d4d8] leading-relaxed">
            This will stop monitoring <span className="text-[#fa5c29] font-bold">{projectName}</span>. Historical data is retained.
          </p>
          <p className="text-[11px] text-[#3f3f46] border-l-2 border-[rgba(248,113,113,0.3)] pl-2">
            The project will be deactivated (soft-delete). This can be reversed via the API.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#1a1a1e] bg-[#08080a]">
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-3 py-1.5 text-[11px] font-bold text-[#6b6b73] border border-[#1a1a1e] hover:text-[#d4d4d8] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-3 py-1.5 text-[11px] font-bold bg-[rgba(248,113,113,0.1)] text-[#f87171] border border-[rgba(248,113,113,0.2)] hover:bg-[rgba(248,113,113,0.15)] transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {deleting && <div className="w-3 h-3 border-2 border-[#f87171]/30 border-t-[#f87171] rounded-full animate-spin" />}
            {deleting ? 'Deleting...' : 'Confirm_Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [status, setStatus] = useState<ProjectStatus | null>(null)
  const [reports, setReports] = useState<ProjectReport[]>([])
  const [loading, setLoading] = useState(true)
  const [hours, setHours] = useState(24)

  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function loadData() {
    if (!id) return
    setLoading(true)
    try {
      const [projectData, statusData, reportsData] = await Promise.all([
        getProject(id),
        getProjectStatus(id, hours),
        getProjectReports(id),
      ])
      setProject(projectData)
      setStatus(statusData)
      setReports(reportsData)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id, hours])

  async function handleDelete() {
    if (!id) return
    setDeleting(true)
    try {
      await deleteProject(id)
      navigate('/dashboard')
    } catch {
      setDeleting(false)
      setShowDelete(false)
    }
  }

  function handleEditSaved(updated: Project) {
    setProject(updated)
    setShowEdit(false)
  }

  const latestCheck = status?.checks[0]
  const isUp = status?.current_status === 'success'

  return (
    <div className="min-h-screen bg-[#050505] text-[#d4d4d8] flex text-[11px] font-mono">
      <TopNav />

      {showEdit && project && (
        <EditModal project={project} onClose={() => setShowEdit(false)} onSaved={handleEditSaved} />
      )}
      {showDelete && project && (
        <DeleteModal
          projectName={project.name}
          onClose={() => setShowDelete(false)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Ticker */}
        <header className="h-9 bg-[#08080a] border-b border-[#1a1a1e] flex items-center px-3 shrink-0">
          <div className="flex items-center gap-1.5 mr-4">
            <span className="text-[9px] font-bold text-[#fa5c29] uppercase tracking-widest">SLA_AWARE</span>
            <span className="text-[#27272a]">|</span>
            <span className="text-[9px] text-[#6b6b73]">v2.4.1</span>
          </div>

          <div className="flex-1 flex items-center gap-5 overflow-hidden">
            <div className="flex items-center gap-1 text-[9px]">
              <span className="text-[#3f3f46] uppercase">STATUS</span>
              <span className={`font-bold ${isUp ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>{isUp ? 'UP' : 'DOWN'}</span>
            </div>
            <div className="flex items-center gap-1 text-[9px]">
              <span className="text-[#3f3f46] uppercase">LAT</span>
              <span className="text-[#d4d4d8] font-bold">{latestCheck?.latency_ms ?? '—'}ms</span>
            </div>
            <div className="flex items-center gap-1 text-[9px]">
              <span className="text-[#3f3f46] uppercase">INC</span>
              <span className="text-[#d4d4d8] font-bold">{reports.length}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[9px] text-[#6b6b73]">
            <span>{new Date().toISOString().split('T')[0]}</span>
            <span className="text-[#fa5c29] font-bold">{new Date().toLocaleTimeString('en-US', { hour12: false })} UTC</span>
          </div>
        </header>

        <main className="flex-1 p-3 overflow-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-[10px] text-[#3f3f46] mb-4">
            <button onClick={() => navigate('/dashboard')} className="hover:text-[#fa5c29] transition-colors">
              PROJECTS
            </button>
            <span>{'>'}</span>
            <span className="text-[#d4d4d8]">{project?.name || '...'}</span>
          </div>

          {/* Header */}
          <div className="mb-5 pb-4 border-b border-[#1a1a1e]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-[18px] font-bold tracking-tight">{project?.name || 'Loading...'}</h1>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[11px] text-[#6b6b73]">
                    URL: <span className="text-[#d4d4d8]">{project?.url || '—'}</span>
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 text-[9px] font-bold border ${
                      isUp
                        ? 'text-[#4ade80] border-[rgba(74,222,128,0.15)] bg-[rgba(74,222,128,0.06)]'
                        : 'text-[#f87171] border-[rgba(248,113,113,0.15)] bg-[rgba(248,113,113,0.06)]'
                    }`}
                  >
                    <span className={`w-1 h-1 ${isUp ? 'bg-[#4ade80]' : 'bg-[#f87171] animate-pulse'}`} />
                    {isUp ? 'UP' : 'DOWN'}
                  </span>
                </div>
              </div>

              {project && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setShowEdit(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold text-[#6b6b73] border border-[#1a1a1e] hover:border-[rgba(250,92,41,0.2)] hover:text-[#fa5c29] transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                    EDIT
                  </button>
                  <button
                    onClick={() => setShowDelete(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold text-[#f87171] border border-[rgba(248,113,113,0.2)] hover:bg-[rgba(248,113,113,0.08)] transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    DELETE
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Chart + Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
            {/* Chart */}
            <div className="lg:col-span-2 border border-[#1a1a1e] bg-[#0d0d10] relative">
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
                      LATENCY_ANALYTICS
                    </span>
                    <span className="text-[#27272a]">[{hours}H]</span>
                  </div>
                  <div className="flex gap-1">
                    {[1, 24, 72].map((h) => (
                      <button
                        key={h}
                        onClick={() => setHours(h)}
                        className={`px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                          hours === h
                            ? 'bg-[rgba(250,92,41,0.06)] text-[#fa5c29] border border-[rgba(250,92,41,0.2)]'
                            : 'bg-[#08080a] text-[#3f3f46] border border-[#1a1a1e] hover:border-[rgba(250,92,41,0.15)]'
                        }`}
                      >
                        {h}H
                      </button>
                    ))}
                  </div>
                </div>
                {loading ? (
                  <div className="h-48 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-[#fa5c29] border-t-transparent animate-spin" />
                  </div>
                ) : (
                  <LatencyChart checks={status?.checks || []} />
                )}
              </div>
            </div>

            {/* Metrics */}
            <div className="border border-[#1a1a1e] bg-[#0d0d10]">
              <div className="px-3 py-2 border-b border-[#1a1a1e] bg-[#08080a]/50">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#fa5c29]" />
                  <span className="text-[10px] font-bold text-[#d4d4d8] uppercase tracking-widest">METRICS</span>
                </div>
              </div>
              <div className="p-3 space-y-0">
                <div className="flex justify-between items-center py-2 border-b border-[#1a1a1e]/30">
                  <span className="text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider">CUR_LAT</span>
                  <span className="text-[16px] font-bold text-[#d4d4d8]">
                    {latestCheck?.latency_ms ?? '—'}
                    <span className="text-[9px] text-[#3f3f46] ml-0.5">MS</span>
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[#1a1a1e]/30">
                  <span className="text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider">STATUS</span>
                  <span className={`text-[16px] font-bold ${isUp ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                    {isUp ? 'UP' : 'DOWN'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[#1a1a1e]/30">
                  <span className="text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider">INCIDENTS</span>
                  <span className="text-[16px] font-bold text-[#d4d4d8]">{reports.length}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider">LAST_CHK</span>
                  <span className="text-[12px] font-bold text-[#d4d4d8]">
                    {latestCheck ? new Date(latestCheck.timestamp).toLocaleTimeString() : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Reports */}
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
              <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1a1a1e] bg-[#08080a]/50">
                <span className="w-1.5 h-1.5 bg-[#fa5c29]" />
                <span className="text-[10px] font-bold text-[#d4d4d8] uppercase tracking-widest">SLA_REPORTS</span>
                <span className="text-[#27272a]">[{reports.length}]</span>
              </div>

              {reports.length === 0 && !loading && (
                <div className="px-3 py-6 text-center text-[#3f3f46] text-[11px]">No reports generated yet.</div>
              )}

              {reports.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[10px]">
                    <thead>
                      <tr className="border-b border-[#1a1a1e]">
                        <th className="px-3 py-1.5 text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider">ID</th>
                        <th className="px-3 py-1.5 text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider text-right">Uptime%</th>
                        <th className="px-3 py-1.5 text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider text-right">AvgMs</th>
                        <th className="px-3 py-1.5 text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider text-right">P95Ms</th>
                        <th className="px-3 py-1.5 text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider text-right">Inc</th>
                        <th className="px-3 py-1.5 text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider">Severity</th>
                        <th className="px-3 py-1.5 text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider text-right">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a1a1e]/40">
                      {reports.map((report) => (
                        <tr key={report.report_id} className="hover:bg-[#08080a] transition-colors">
                          <td className="px-3 py-1.5 text-[#d4d4d8] font-mono text-[9px]">{report.report_id}</td>
                          <td className="px-3 py-1.5 text-right text-[#d4d4d8] font-mono">{report.uptime_pct.toFixed(2)}%</td>
                          <td className="px-3 py-1.5 text-right text-[#d4d4d8] font-mono">{report.avg_latency_ms}ms</td>
                          <td className="px-3 py-1.5 text-right text-[#d4d4d8] font-mono">{report.p95_latency_ms}ms</td>
                          <td className="px-3 py-1.5 text-right text-[#d4d4d8] font-mono">{report.incident_count}</td>
                          <td className="px-3 py-1.5">
                            <span className={`text-[9px] font-bold uppercase ${SEVERITY_COLORS[report.severity]}`}>
                              {SEVERITY_LABELS[report.severity]}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {report.sla_pass ? (
                              <span className="text-[#4ade80] font-bold text-[10px]">PASS</span>
                            ) : (
                              <span className="text-[#f87171] font-bold text-[10px]">FAIL</span>
                            )}
                          </td>
                        </tr>
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
    </div>
  )
}
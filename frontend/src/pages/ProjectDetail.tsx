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
  healthy: 'status-healthy',
  degraded: 'status-degraded',
  major: 'status-major',
  critical: 'status-critical',
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
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg mx-4 bg-surface-container border border-outline-variant shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant bg-surface-container-high">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-theme-orange text-base">edit</span>
            <span className="font-mono text-sm font-bold uppercase tracking-widest text-on-surface">EDIT_PROJECT</span>
          </div>
          <button
            onClick={onClose}
            className="material-symbols-outlined text-on-surface-variant hover:text-theme-orange transition-colors text-base cursor-pointer"
          >
            close
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">
              Project_Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-surface-container-low border border-outline-variant text-on-surface font-mono text-sm px-3 py-2 focus:outline-none focus:border-theme-orange transition-colors"
              placeholder="My Portfolio"
            />
          </div>

          {/* URL */}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">
              Target_URL
            </label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="w-full bg-surface-container-low border border-outline-variant text-on-surface font-mono text-sm px-3 py-2 focus:outline-none focus:border-theme-orange transition-colors"
              placeholder="https://example.com"
            />
          </div>

          {/* Notification Email */}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">
              Notification_Email
            </label>
            <input
              type="email"
              value={form.notification_email}
              onChange={(e) => setForm({ ...form, notification_email: e.target.value })}
              className="w-full bg-surface-container-low border border-outline-variant text-on-surface font-mono text-sm px-3 py-2 focus:outline-none focus:border-theme-orange transition-colors"
              placeholder="alerts@example.com"
            />
          </div>

          {/* Failure Threshold */}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">
              Failure_Threshold <span className="text-outline-variant">(consecutive failures)</span>
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={form.failure_threshold}
              onChange={(e) => setForm({ ...form, failure_threshold: Number(e.target.value) })}
              className="w-full bg-surface-container-low border border-outline-variant text-on-surface font-mono text-sm px-3 py-2 focus:outline-none focus:border-theme-orange transition-colors"
            />
          </div>

          {/* SLA Thresholds */}
          <div className="border border-outline-variant/50 p-3 space-y-3 bg-surface-container-low">
            <div className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
              SLA_Thresholds
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[10px] text-outline-variant mb-1">
                  Min_Uptime_%
                </label>
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
                  className="w-full bg-surface-container border border-outline-variant text-on-surface font-mono text-sm px-3 py-2 focus:outline-none focus:border-theme-orange transition-colors"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] text-outline-variant mb-1">
                  Max_Latency_MS
                </label>
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
                  className="w-full bg-surface-container border border-outline-variant text-on-surface font-mono text-sm px-3 py-2 focus:outline-none focus:border-theme-orange transition-colors"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-status-critical font-mono text-[11px] border border-status-critical/30 bg-status-critical/10 px-3 py-2">
              <span className="material-symbols-outlined text-sm">error</span>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-outline-variant bg-surface-container-high">
          <button
            onClick={onClose}
            className="px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-on-surface-variant border border-outline-variant hover:border-theme-orange/40 hover:text-on-surface transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider bg-theme-orange/20 text-theme-orange border border-theme-orange/40 hover:bg-theme-orange/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
          >
            {saving && (
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
            )}
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !deleting) onClose() }}
    >
      <div className="w-full max-w-sm mx-4 bg-surface-container border border-status-critical/40 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-status-critical/30 bg-status-critical/10">
          <span className="material-symbols-outlined text-status-critical text-base">warning</span>
          <span className="font-mono text-sm font-bold uppercase tracking-widest text-status-critical">CONFIRM_DELETE</span>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-3">
          <p className="font-mono text-sm text-on-surface leading-relaxed">
            This will stop monitoring{' '}
            <span className="text-theme-orange font-bold">{projectName}</span>.
            Historical data (checks, incidents, reports) is retained.
          </p>
          <p className="font-mono text-[11px] text-on-surface-variant border-l-2 border-status-critical/50 pl-3">
            The project will be deactivated (soft-delete). This action can be reversed by re-activating via the API.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-outline-variant bg-surface-container-high">
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-on-surface-variant border border-outline-variant hover:border-theme-orange/40 hover:text-on-surface transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider bg-status-critical/20 text-status-critical border border-status-critical/40 hover:bg-status-critical/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
          >
            {deleting && (
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
            )}
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

  // Modal state
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
    <div className="min-h-screen flex flex-col">
      <TopNav />

      {/* Modals */}
      {showEdit && project && (
        <EditModal
          project={project}
          onClose={() => setShowEdit(false)}
          onSaved={handleEditSaved}
        />
      )}
      {showDelete && project && (
        <DeleteModal
          projectName={project.name}
          onClose={() => setShowDelete(false)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}

      <main className="flex-1 max-w-container-max mx-auto px-margin-page py-6 w-full">
        {/* Page Header */}
        <div className="mb-6 border-b border-outline-variant/30 pb-6">
          <nav className="flex items-center gap-2 text-[10px] font-mono text-on-surface-variant uppercase tracking-tighter mb-2">
            <button onClick={() => navigate('/dashboard')} className="hover:text-theme-orange cursor-pointer">ROOT</button>
            <span className="material-symbols-outlined text-[10px]">chevron_right</span>
            <button onClick={() => navigate('/dashboard')} className="hover:text-theme-orange cursor-pointer">PROJECTS</button>
            <span className="material-symbols-outlined text-[10px]">chevron_right</span>
            <span className="text-theme-orange">{project?.name || '...'}</span>
          </nav>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-headline-lg text-3xl tracking-tighter text-on-surface font-mono uppercase">
                {project?.name || 'Loading...'}
              </h1>
              <div className="flex items-center gap-4 mt-2">
                <span className="font-mono text-xs text-on-surface-variant">
                  URL: <span className="text-on-surface">{project?.url || '—'}</span>
                </span>
                <div
                  className={`flex items-center gap-1.5 px-2 py-0.5 ${
                    isUp
                      ? 'bg-status-healthy/10 text-status-healthy border border-status-healthy/30'
                      : 'bg-status-critical/10 text-status-critical border border-status-critical/30'
                  } rounded text-[10px] font-bold uppercase tracking-widest font-mono`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isUp ? 'bg-status-healthy animate-pulse' : 'bg-status-critical animate-pulse'
                    }`}
                  />
                  {isUp ? 'UP' : 'DOWN'}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            {project && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowEdit(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-on-surface-variant border border-outline-variant hover:border-theme-orange/40 hover:text-theme-orange transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                  Edit
                </button>
                <button
                  onClick={() => setShowDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-status-critical border border-status-critical/30 bg-status-critical/5 hover:bg-status-critical/15 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Charts & Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
          <div className="lg:col-span-4 bg-surface-container-low border border-outline-variant p-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-mono text-sm text-on-surface uppercase tracking-widest font-bold">
                  Latency Analytics ({hours}H)
                </h3>
                <p className="font-mono text-[10px] text-on-surface-variant">Real-time performance distribution</p>
              </div>
              <div className="flex gap-2">
                {[1, 24, 72].map((h) => (
                  <button
                    key={h}
                    onClick={() => setHours(h)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
                      hours === h
                        ? 'bg-theme-orange/20 text-theme-orange border border-theme-orange/30'
                        : 'bg-surface-container-high text-on-surface-variant border border-outline-variant hover:border-theme-orange/30'
                    }`}
                  >
                    {h}H
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <div className="h-48 flex items-center justify-center">
                <span className="material-symbols-outlined text-theme-orange animate-spin">progress_activity</span>
              </div>
            ) : (
              <LatencyChart checks={status?.checks || []} />
            )}
          </div>

          <div className="bg-surface-container-high border-l-4 border-l-theme-orange p-4 flex flex-col justify-between hover:bg-surface-container-highest transition-colors">
            <div className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest">Latency_Current</div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-on-surface tracking-tighter font-mono">
                {latestCheck?.latency_ms ?? '—'}
                <span className="text-xs font-normal text-on-surface-variant ml-1">MS</span>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-high border-l-4 border-l-primary p-4 flex flex-col justify-between hover:bg-surface-container-highest transition-colors">
            <div className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest">Current_Status</div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-on-surface tracking-tighter font-mono">{isUp ? 'UP' : 'DOWN'}</div>
            </div>
          </div>

          <div className="bg-surface-container-high border-l-4 border-l-tertiary p-4 flex flex-col justify-between hover:bg-surface-container-highest transition-colors">
            <div className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest">Incident_Count</div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-on-surface tracking-tighter font-mono">{reports.length}</div>
            </div>
          </div>

          <div className="bg-surface-container-high border-l-4 border-l-outline p-4 flex flex-col justify-between hover:bg-surface-container-highest transition-colors">
            <div className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest">Last_Checked</div>
            <div className="flex items-baseline gap-2">
              <div className="text-lg font-bold text-on-surface tracking-tighter font-mono">
                {latestCheck ? new Date(latestCheck.timestamp).toLocaleTimeString() : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* SLA Reports Table */}
        <div className="bg-surface-container-low border border-outline-variant scanline overflow-hidden">
          <div className="px-4 py-3 border-b border-outline-variant flex justify-between items-center bg-surface-container">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-theme-orange">analytics</span>
              <h3 className="font-mono text-sm text-on-surface uppercase tracking-widest font-bold">SLA_REPORTS_HISTORY</h3>
            </div>
          </div>

          {reports.length === 0 && !loading && (
            <div className="px-4 py-8 text-center text-on-surface-variant font-mono text-sm">
              No reports generated yet.
            </div>
          )}

          {reports.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-[11px]">
                <thead>
                  <tr className="bg-surface-container-high border-b border-outline-variant">
                    <th className="px-4 py-2 text-outline-variant uppercase font-semibold">Report_ID</th>
                    <th className="px-4 py-2 text-outline-variant uppercase font-semibold">Uptime_%</th>
                    <th className="px-4 py-2 text-outline-variant uppercase font-semibold">Latency_Avg</th>
                    <th className="px-4 py-2 text-outline-variant uppercase font-semibold">P95_Latency</th>
                    <th className="px-4 py-2 text-outline-variant uppercase font-semibold">Incidents</th>
                    <th className="px-4 py-2 text-outline-variant uppercase font-semibold">Severity</th>
                    <th className="px-4 py-2 text-outline-variant uppercase font-semibold">SLA_Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {reports.map((report) => (
                    <tr
                      key={report.report_id}
                      className="hover:bg-surface-container-high/50 transition-all group border-l-2 border-l-transparent hover:border-l-theme-orange"
                    >
                      <td className="px-4 py-2 text-on-surface group-hover:text-theme-orange">{report.report_id}</td>
                      <td className="px-4 py-2 text-on-surface font-mono">{report.uptime_pct.toFixed(2)}%</td>
                      <td className="px-4 py-2 text-on-surface font-mono">{report.avg_latency_ms}ms</td>
                      <td className="px-4 py-2 text-on-surface font-mono">{report.p95_latency_ms}ms</td>
                      <td className="px-4 py-2 text-on-surface font-mono">{report.incident_count}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`px-1.5 py-0.5 border text-[9px] font-bold font-mono ${
                            SEVERITY_COLORS[report.severity] === 'status-healthy'
                              ? 'border-status-healthy/30 bg-status-healthy/10 text-status-healthy'
                              : SEVERITY_COLORS[report.severity] === 'status-degraded'
                              ? 'border-status-degraded/30 bg-status-degraded/10 text-status-degraded'
                              : SEVERITY_COLORS[report.severity] === 'status-major'
                              ? 'border-status-major/30 bg-status-major/10 text-status-major'
                              : 'border-status-critical/30 bg-status-critical/10 text-status-critical'
                          }`}
                        >
                          {SEVERITY_LABELS[report.severity]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {report.sla_pass ? (
                          <span className="text-status-healthy font-bold flex items-center justify-end gap-1">
                            <span className="material-symbols-outlined text-sm">check_small</span> PASS
                          </span>
                        ) : (
                          <span className="text-status-critical font-bold flex items-center justify-end gap-1">
                            <span className="material-symbols-outlined text-sm">close</span> FAIL
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
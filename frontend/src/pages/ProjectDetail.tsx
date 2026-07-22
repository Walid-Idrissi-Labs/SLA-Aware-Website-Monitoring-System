import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  RefreshCw,
  SquarePen,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import Shell from '../components/Shell'
import Modal from '../components/Modal'
import StatCard from '../components/StatCard'
import LatencyChart from '../components/LatencyChart'
import StatusStrip from '../components/StatusStrip'
import {
  getProject,
  getProjectStatus,
  getProjectReports,
  updateProject,
  deleteProject,
  generateReport,
  getReportDownloadUrl,
} from '../lib/api'
import { Alert, Spinner, StatusDot } from '../components/ui'
import type { ProjectStatus, ProjectReport, Project, UpdateProjectInput } from '../types'
import { SEVERITY, PROJECT_DEFAULTS, POLL_INTERVAL_MS, uptimeFromChecks, bareUrl, fmtUtcTime } from '../lib/format'

function formatDowntime(sec: number): string {
  if (!sec) return '0s'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

// ─── Edit Modal ─────────────────────────────────────────────────────────────
interface EditModalProps {
  project: Project
  onClose: () => void
  onSaved: (updated: Project) => void
}

function EditModal({ project, onClose, onSaved }: EditModalProps) {
  const [form, setForm] = useState<UpdateProjectInput>({
    name: project.name,
    url: project.url,
    failure_threshold: project.failure_threshold ?? PROJECT_DEFAULTS.failure_threshold,
    notification_email: project.notification_email ?? '',
    thresholds: {
      min_uptime_pct: project.thresholds?.min_uptime_pct ?? PROJECT_DEFAULTS.min_uptime_pct,
      max_avg_latency_ms: project.thresholds?.max_avg_latency_ms ?? PROJECT_DEFAULTS.max_avg_latency_ms,
    },
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const updated = await updateProject(project.project_id, form)
      onSaved(updated)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update project')
      setSaving(false)
    }
  }

  return (
    <Modal title="Edit monitor" description="Changes apply from the next check." onClose={onClose} closeDisabled={saving}>
      <form onSubmit={handleSave}>
        <div className="space-y-4 px-5 pb-5">
          {error && <Alert tone="error">{error}</Alert>}
          <div>
            <label className="label" htmlFor="edit-name">Name</label>
            <input id="edit-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="edit-url">URL</label>
            <input id="edit-url" type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="input font-mono" />
          </div>
          <div>
            <label className="label" htmlFor="edit-email">Notification email</label>
            <input id="edit-email" type="email" value={form.notification_email} onChange={(e) => setForm({ ...form, notification_email: e.target.value })} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="edit-threshold">Failure threshold</label>
              <input id="edit-threshold" type="number" min={1} max={10} value={form.failure_threshold} onChange={(e) => setForm({ ...form, failure_threshold: Number(e.target.value) })} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="edit-uptime">Uptime target (%)</label>
              <input
                id="edit-uptime"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={form.thresholds?.min_uptime_pct}
                onChange={(e) => setForm({ ...form, thresholds: { ...form.thresholds!, min_uptime_pct: Number(e.target.value) } })}
                className="input"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="edit-latency">Latency target (ms)</label>
            <input
              id="edit-latency"
              type="number"
              min={0}
              value={form.thresholds?.max_avg_latency_ms}
              onChange={(e) => setForm({ ...form, thresholds: { ...form.thresholds!, max_avg_latency_ms: Number(e.target.value) } })}
              className="input"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-edge px-5 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving && <Spinner />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Delete Modal ───────────────────────────────────────────────────────────
interface DeleteModalProps {
  projectName: string
  onClose: () => void
  onConfirm: () => void
  deleting: boolean
  error: string | null
}

function DeleteModal({ projectName, onClose, onConfirm, deleting, error }: DeleteModalProps) {
  return (
    <Modal title="Delete monitor" onClose={onClose} closeDisabled={deleting} maxWidth="sm">
      <div className="space-y-3 px-5 pb-5">
        <p className="text-[13px] leading-relaxed text-txt-mid">
          This stops monitoring <span className="font-medium text-txt-hi">{projectName}</span>. Its check history and
          reports are kept.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
      </div>
      <div className="flex justify-end gap-2 border-t border-edge px-5 py-4">
        <button onClick={onClose} disabled={deleting} className="btn-secondary">Cancel</button>
        <button onClick={onConfirm} disabled={deleting} className="btn-danger">
          {deleting && <Spinner />}
          {deleting ? 'Deleting…' : 'Delete monitor'}
        </button>
      </div>
    </Modal>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [status, setStatus] = useState<ProjectStatus | null>(null)
  const [reports, setReports] = useState<ProjectReport[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hours, setHours] = useState(24)
  const requestSeq = useRef(0)

  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [genDays, setGenDays] = useState<1 | 7 | 30>(7)
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [downloadKey, setDownloadKey] = useState<string | null>(null)

  const loadData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!id) return
      // Sequence counter: switching the time window mid-flight starts a new
      // request, and only the latest one is allowed to land.
      const seq = ++requestSeq.current
      if (options?.silent) setRefreshing(true)
      else setLoading(true)
      try {
        const [projectData, statusData, reportsData] = await Promise.all([
          getProject(id),
          getProjectStatus(id, hours),
          getProjectReports(id),
        ])
        if (seq !== requestSeq.current) return
        setProject(projectData)
        setStatus(statusData)
        setReports(reportsData)
        setLoadError(null)
      } catch (e) {
        if (seq !== requestSeq.current) return
        setLoadError(e instanceof Error ? e.message : 'Failed to load monitor')
      } finally {
        if (seq === requestSeq.current) {
          if (options?.silent) setRefreshing(false)
          else setLoading(false)
        }
      }
    },
    [hours, id]
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const intervalId = window.setInterval(() => loadData({ silent: true }), POLL_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [loadData])

  async function handleDelete() {
    if (!id) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteProject(id)
      navigate('/dashboard')
    } catch (e) {
      setDeleting(false)
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete monitor')
    }
  }

  const checks = useMemo(() => status?.checks || [], [status])
  const latestCheck = checks[checks.length - 1]
  const isUp = status?.current_status === 'success'
  const hasChecks = checks.length > 0
  const uptime = uptimeFromChecks(checks)
  const sortedReports = [...reports].sort((a, b) => b.generated_at.localeCompare(a.generated_at))

  const windowStats = useMemo(() => {
    const okLatencies = checks
      .filter((c) => c.status === 'success')
      .map((c) => c.latency_ms)
      .sort((a, b) => a - b)
    if (okLatencies.length === 0) return { avg: null as number | null, p95: null as number | null }
    const avg = Math.round(okLatencies.reduce((s, v) => s + v, 0) / okLatencies.length)
    const p95 = okLatencies[Math.min(Math.floor(okLatencies.length * 0.95), okLatencies.length - 1)]
    return { avg, p95 }
  }, [checks])

  async function handleGenerate() {
    if (!id) return
    setGenerating(true)
    setGenMsg(null)
    try {
      // Generation is synchronous: the report is stored by the time this resolves.
      const res = await generateReport(id, genDays)
      const fresh = await getProjectReports(id)
      setReports(fresh)
      setGenMsg({
        type: 'success',
        text: res?.report_id ? `Report ${res.report_id} is ready.` : 'Report generated.',
      })
    } catch (e) {
      setGenMsg({ type: 'error', text: e instanceof Error ? e.message : 'Could not generate report.' })
    } finally {
      setGenerating(false)
    }
  }

  async function downloadReport(reportId: string, format: 'html' | 'json') {
    if (!id) return
    setDownloadKey(`${reportId}:${format}`)
    try {
      const { url } = await getReportDownloadUrl(id, reportId, format)
      const a = document.createElement('a')
      a.href = url
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      setGenMsg({ type: 'error', text: e instanceof Error ? e.message : 'Download failed.' })
    } finally {
      setDownloadKey(null)
    }
  }

  function exportCsv() {
    const cols: (keyof ProjectReport)[] = [
      'report_id', 'uptime_pct', 'avg_latency_ms', 'p95_latency_ms',
      'incident_count', 'total_downtime_sec', 'severity', 'sla_pass', 'generated_at',
    ]
    const esc = (v: unknown) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [cols.join(','), ...sortedReports.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(project?.name || 'project').replace(/\s+/g, '-')}-sla-reports.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Initial load failed and there is nothing to show — a clean error state
  // beats an eternal "Loading…" header.
  if (!project && !loading && loadError) {
    return (
      <Shell>
        <div className="card mx-auto mt-16 flex max-w-md flex-col items-center gap-4 p-8 text-center">
          <TriangleAlert className="h-6 w-6 text-crit" strokeWidth={1.75} />
          <div>
            <p className="text-[14px] font-semibold text-txt-hi">Couldn't load this monitor</p>
            <p className="mt-1 text-[13px] text-txt-mid">{loadError}</p>
          </div>
          <div className="flex gap-2">
            <Link to="/dashboard" className="btn-secondary">Back to monitors</Link>
            <button onClick={() => loadData()} className="btn-primary">Retry</button>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      {showEdit && project && <EditModal project={project} onClose={() => setShowEdit(false)} onSaved={(u) => { setProject(u); setShowEdit(false) }} />}
      {showDelete && project && (
        <DeleteModal
          projectName={project.name}
          onClose={() => { setShowDelete(false); setDeleteError(null) }}
          onConfirm={handleDelete}
          deleting={deleting}
          error={deleteError}
        />
      )}

      {/* Back link */}
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-txt-mid transition-colors hover:text-txt-hi animate-fade-up"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Monitors
      </Link>

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4 animate-fade-up" style={{ animationDelay: '30ms' }}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-txt-hi">{project?.name || 'Loading…'}</h1>
            {project && status && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${
                  isUp ? 'border-ok/25 bg-ok/10 text-ok' : 'border-crit/25 bg-crit/10 text-crit'
                }`}
              >
                <StatusDot tone={isUp ? 'ok' : 'crit'} pulse={!isUp} />
                {isUp ? 'Operational' : 'Down'}
              </span>
            )}
          </div>
          {project && (
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-[12px] text-txt-lo transition-colors hover:text-txt-hi"
            >
              {bareUrl(project.url)}
              <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
            </a>
          )}
        </div>

        {project && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData({ silent: true })}
              disabled={loading || refreshing}
              title="Refresh"
              aria-label="Refresh"
              className="btn-secondary h-9 w-9 !px-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
            <button onClick={() => setShowEdit(true)} className="btn-secondary">
              <SquarePen className="h-3.5 w-3.5" strokeWidth={1.75} />
              Edit
            </button>
            <button onClick={() => setShowDelete(true)} className="btn-danger">
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Window stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 animate-fade-up" style={{ animationDelay: '60ms' }}>
        <StatCard
          label={`Uptime · ${hours}h`}
          value={uptime !== null ? uptime.toFixed(2) : null}
          unit="%"
          tone={uptime !== null && uptime < 100 ? 'warn' : 'default'}
          sub={hasChecks ? `${checks.length} checks in window` : 'no checks yet'}
        />
        <StatCard label={`Avg response · ${hours}h`} value={windowStats.avg} unit="ms" sub="successful checks" />
        <StatCard label={`P95 response · ${hours}h`} value={windowStats.p95} unit="ms" sub="95th percentile" />
        <StatCard
          label="Latest check"
          value={latestCheck ? latestCheck.latency_ms : null}
          unit="ms"
          sub={
            latestCheck
              ? `HTTP ${latestCheck.http_status_code || 'error'} · ${fmtUtcTime(latestCheck.timestamp)}`
              : 'awaiting first check'
          }
        />
      </div>

      {/* Response time chart */}
      <div className="card mt-3 overflow-hidden animate-fade-up" style={{ animationDelay: '90ms' }}>
        <div className="flex items-center justify-between gap-3 border-b border-edge px-5 py-3.5">
          <h2 className="text-[13.5px] font-semibold text-txt-hi">Response time</h2>
          <div className="seg">
            {[1, 24, 72].map((h) => (
              <button
                key={h}
                onClick={() => setHours(h)}
                className={`seg-item ${hours === h ? 'seg-item-active' : ''}`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>
        <div className="px-2 pt-3">
          {loading ? (
            <div className="grid h-[260px] place-items-center text-txt-lo">
              <Spinner size={22} />
            </div>
          ) : (
            <LatencyChart checks={checks} />
          )}
        </div>
        {hasChecks && (
          <div className="border-t border-edge px-5 py-3.5">
            <StatusStrip checks={checks} bars={60} />
            <p className="mt-2 text-[11.5px] text-txt-lo">Check results, oldest to newest — green passed, red failed.</p>
          </div>
        )}
      </div>

      {/* Reports */}
      <div className="card mt-3 overflow-hidden animate-fade-up" style={{ animationDelay: '120ms' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3.5">
          <div>
            <h2 className="text-[13.5px] font-semibold text-txt-hi">SLA reports</h2>
            <p className="mt-0.5 text-[12px] text-txt-lo">Generated every Monday at 08:00 UTC, or on demand.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {reports.length > 0 && (
              <button onClick={exportCsv} disabled={generating} className="btn-secondary btn-compact">
                <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                Export CSV
              </button>
            )}
            <div className="seg">
              {([1, 7, 30] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setGenDays(d)}
                  disabled={generating}
                  className={`seg-item ${genDays === d ? 'seg-item-active' : ''}`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <button onClick={handleGenerate} disabled={generating} className="btn-primary btn-compact">
              {generating && <Spinner size={12} />}
              {generating ? 'Generating…' : 'Generate report'}
            </button>
          </div>
        </div>

        {genMsg && (
          <Alert tone={genMsg.type} className="mx-5 mt-4">
            {genMsg.text}
          </Alert>
        )}

        {reports.length === 0 && !loading && (
          <div className="px-5 py-14 text-center text-[13px] text-txt-lo">
            No reports yet — generate one above, or the weekly report lands Monday 08:00 UTC.
          </div>
        )}

        {reports.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-edge">
                  <th className="th text-left">Report</th>
                  <th className="th text-right">Uptime</th>
                  <th className="th text-right">Avg</th>
                  <th className="th text-right">P95</th>
                  <th className="th text-right">Incidents</th>
                  <th className="th text-right">Downtime</th>
                  <th className="th text-left">Severity</th>
                  <th className="th text-right">SLA</th>
                  <th className="th text-right">Download</th>
                </tr>
              </thead>
              <tbody>
                {sortedReports.map((r) => {
                  const sev = SEVERITY[r.severity] ?? SEVERITY.healthy
                  return (
                    <tr key={r.report_id} className="border-b border-edge/60 transition-colors last:border-0 hover:bg-soft/40">
                      <td className="px-4 py-3 text-left font-mono text-[12.5px] font-medium text-txt-hi">{r.report_id}</td>
                      <td className="tnum px-4 py-3 text-right text-[13px] text-txt-mid">{r.uptime_pct.toFixed(2)}%</td>
                      <td className="tnum px-4 py-3 text-right text-[13px] text-txt-mid">{r.avg_latency_ms}ms</td>
                      <td className="tnum px-4 py-3 text-right text-[13px] text-txt-mid">{r.p95_latency_ms}ms</td>
                      <td className="tnum px-4 py-3 text-right text-[13px] text-txt-mid">{r.incident_count}</td>
                      <td className="tnum px-4 py-3 text-right text-[13px] text-txt-mid">{formatDowntime(r.total_downtime_sec)}</td>
                      <td className="px-4 py-3 text-left">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium"
                          style={{ color: sev.color, borderColor: `${sev.color}40`, background: sev.dim }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: sev.color }} />
                          {sev.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-[12.5px] font-medium ${r.sla_pass ? 'text-ok' : 'text-crit'}`}>
                          {r.sla_pass ? 'Pass' : 'Fail'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {(['html', 'json'] as const).map((fmt) => {
                            const busy = downloadKey === `${r.report_id}:${fmt}`
                            return (
                              <button
                                key={fmt}
                                onClick={() => downloadReport(r.report_id, fmt)}
                                disabled={busy}
                                title={`Download ${fmt.toUpperCase()}`}
                                className="inline-flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-[11px] font-medium uppercase text-txt-lo transition-colors hover:border-edge-strong hover:bg-soft hover:text-txt-hi disabled:opacity-50"
                              >
                                {busy ? (
                                  <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                                ) : (
                                  <Download className="h-3 w-3" strokeWidth={1.75} />
                                )}
                                {fmt}
                              </button>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  )
}

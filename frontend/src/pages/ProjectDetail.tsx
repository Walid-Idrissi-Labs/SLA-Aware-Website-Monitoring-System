import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  RefreshCw,
  SquarePen,
  Trash2,
  X,
  TriangleAlert,
  ExternalLink,
  ChevronRight,
  CircleCheck,
  CircleAlert,
  Download,
  Sheet,
  Zap,
} from 'lucide-react'
import Shell from '../components/Shell'
import TickerStat from '../components/TickerStat'
import LatencyChart from '../components/LatencyChart'
import UptimeGauge from '../components/UptimeGauge'
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
import type { ProjectStatus, ProjectReport, Project, UpdateProjectInput } from '../types'
import { SEVERITY, uptimeFromChecks, bareUrl } from '../lib/format'

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
    failure_threshold: project.failure_threshold ?? 3,
    notification_email: project.notification_email ?? '',
    thresholds: {
      min_uptime_pct: project.thresholds?.min_uptime_pct ?? 99.9,
      max_avg_latency_ms: project.thresholds?.max_avg_latency_ms ?? 300,
    },
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div className="panel frame-corners w-full max-w-lg animate-scale-in overflow-hidden">
        <div className="panel-head">
          <div className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-accent/[0.12] text-accent">
              <SquarePen className="h-3.5 w-3.5" strokeWidth={1.75} />
            </span>
            <div className="leading-tight">
              <p className="kicker">Configure</p>
              <p className="font-display text-[13px] font-semibold text-txt-hi">Edit endpoint</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-txt-lo transition-colors hover:bg-white/[0.05] hover:text-txt-hi">
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="field-label">Project Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" />
          </div>
          <div>
            <label className="field-label">Target URL</label>
            <input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="field" />
          </div>
          <div>
            <label className="field-label">Notification Email</label>
            <input type="email" value={form.notification_email} onChange={(e) => setForm({ ...form, notification_email: e.target.value })} className="field" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Failure Threshold</label>
              <input type="number" min={1} max={10} value={form.failure_threshold} onChange={(e) => setForm({ ...form, failure_threshold: Number(e.target.value) })} className="field" />
            </div>
            <div>
              <label className="field-label">Min Uptime %</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={form.thresholds?.min_uptime_pct}
                onChange={(e) => setForm({ ...form, thresholds: { ...form.thresholds!, min_uptime_pct: Number(e.target.value) } })}
                className="field"
              />
            </div>
          </div>
          <div>
            <label className="field-label">Max Latency (ms)</label>
            <input
              type="number"
              min={0}
              value={form.thresholds?.max_avg_latency_ms}
              onChange={(e) => setForm({ ...form, thresholds: { ...form.thresholds!, max_avg_latency_ms: Number(e.target.value) } })}
              className="field"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-crit/25 bg-crit/[0.06] px-3 py-2 text-[12px] text-crit">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/[0.06] bg-white/[0.01] px-5 py-4">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-accent">
            {saving && <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Modal ───────────────────────────────────────────────────────────
interface DeleteModalProps {
  projectName: string
  onClose: () => void
  onConfirm: () => void
  deleting: boolean
}

function DeleteModal({ projectName, onClose, onConfirm, deleting }: DeleteModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && !deleting && onClose()}
    >
      <div className="panel w-full max-w-sm animate-scale-in overflow-hidden border-crit/25">
        <div className="flex items-center gap-2.5 border-b border-crit/20 bg-crit/[0.05] px-5 h-11">
          <TriangleAlert className="h-4 w-4 text-crit" strokeWidth={1.75} />
          <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-crit">Confirm Delete</span>
        </div>
        <div className="space-y-2 p-5">
          <p className="text-[13px] leading-relaxed text-txt-mid">
            This stops monitoring <span className="font-semibold text-accent">{projectName}</span>. Historical data is retained.
          </p>
          <p className="border-l-2 border-crit/40 pl-3 text-[11px] text-txt-lo">
            The endpoint is deactivated (soft-delete) and can be restored via the API.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/[0.06] px-5 py-4">
          <button onClick={onClose} disabled={deleting} className="btn-ghost">Cancel</button>
          <button onClick={onConfirm} disabled={deleting} className="btn-danger">
            {deleting && <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-crit/40 border-t-crit" />}
            {deleting ? 'Deleting…' : 'Confirm Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Vitals metric row ──────────────────────────────────────────────────────
function Metric({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.05] py-2.5 last:border-0">
      <span className="micro">{label}</span>
      <span className="data text-[14px] font-semibold" style={{ color: color ?? '#eceef0' }}>
        {value}
      </span>
    </div>
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
  const [hours, setHours] = useState(24)
  const loadingRef = useRef(false)

  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [genDays, setGenDays] = useState<1 | 7 | 30>(7)
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [downloadKey, setDownloadKey] = useState<string | null>(null)

  const loadData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!id || loadingRef.current) return
      loadingRef.current = true
      if (options?.silent) setRefreshing(true)
      else setLoading(true)
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
        if (options?.silent) setRefreshing(false)
        else setLoading(false)
        loadingRef.current = false
      }
    },
    [hours, id]
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const intervalId = window.setInterval(() => loadData({ silent: true }), 60000)
    return () => window.clearInterval(intervalId)
  }, [loadData])

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

  const checks = status?.checks || []
  const latestCheck = checks[checks.length - 1]
  const isUp = status?.current_status === 'success'
  const uptime = uptimeFromChecks(checks)
  const sortedReports = [...reports].sort((a, b) => b.generated_at.localeCompare(a.generated_at))

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

  const ticker = (
    <>
      <TickerStat label="Status" value={isUp ? 'UP' : 'DOWN'} color={isUp ? '#34d399' : '#f87171'} />
      <TickerStat label="Latency" value={latestCheck ? `${latestCheck.latency_ms}ms` : '—'} />
      <TickerStat label="Reports" value={String(reports.length)} />
    </>
  )

  return (
    <Shell ticker={ticker}>
      {showEdit && project && <EditModal project={project} onClose={() => setShowEdit(false)} onSaved={(u) => { setProject(u); setShowEdit(false) }} />}
      {showDelete && project && (
        <DeleteModal projectName={project.name} onClose={() => setShowDelete(false)} onConfirm={handleDelete} deleting={deleting} />
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 font-mono text-[11px] text-txt-lo animate-fade-up">
        <Link to="/dashboard" className="flex items-center gap-1.5 transition-colors hover:text-accent">
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          Overview
        </Link>
        <ChevronRight className="h-3 w-3 text-txt-dim" strokeWidth={1.75} />
        <span className="truncate text-txt-mid">{project?.name || '…'}</span>
      </nav>

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] pb-5 animate-fade-up" style={{ animationDelay: '60ms' }}>
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[24px] font-bold tracking-tight text-txt-hi">{project?.name || 'Loading…'}</h1>
            {project && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider ${
                  isUp ? 'border-ok/25 bg-ok/[0.08] text-ok' : 'border-crit/25 bg-crit/[0.08] text-crit'
                }`}
              >
                {isUp ? (
                  <CircleCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
                ) : (
                  <CircleAlert className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
                {isUp ? 'Operational' : 'Down'}
              </span>
            )}
          </div>
          {project && (
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 font-mono text-[12px] text-txt-lo transition-colors hover:text-accent"
            >
              {bareUrl(project.url)}
              <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
            </a>
          )}
        </div>

        {project && (
          <div className="flex items-center gap-2">
            <button onClick={() => loadData({ silent: true })} disabled={loading || refreshing} className="btn-ghost">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin-slow' : ''}`} strokeWidth={1.75} />
              {refreshing ? 'Syncing' : 'Refresh'}
            </button>
            <button onClick={() => setShowEdit(true)} className="btn-ghost">
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

      {/* Chart + Vitals */}
      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Chart */}
        <div className="panel-flush lg:col-span-2 animate-fade-up" style={{ animationDelay: '120ms' }}>
          <div className="panel-head">
            <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-txt-hi">Latency Analytics</span>
            <div className="flex gap-1">
              {[1, 24, 72].map((h) => (
                <button
                  key={h}
                  onClick={() => setHours(h)}
                  className={`rounded px-2 py-1 font-mono text-[10px] font-bold uppercase transition-colors ${
                    hours === h
                      ? 'border border-accent/40 bg-accent/[0.1] text-accent'
                      : 'border border-white/[0.07] text-txt-lo hover:text-txt-mid'
                  }`}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>
          <div className="grid-overlay p-2">
            {loading ? (
              <div className="grid h-[260px] place-items-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              </div>
            ) : (
              <LatencyChart checks={checks} />
            )}
          </div>
        </div>

        {/* Vitals */}
        <div className="panel animate-fade-up p-5" style={{ animationDelay: '180ms' }}>
          <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-txt-hi">Vitals</span>
          <div className="hr-accent mt-3" />

          <div className="mt-4 flex justify-center">
            <UptimeGauge value={uptime} label={`Uptime · ${hours}h`} />
          </div>

          <div className="mt-4">
            <Metric label="Current Latency" value={latestCheck ? `${latestCheck.latency_ms}ms` : '—'} />
            <Metric label="Status" value={isUp ? 'UP' : 'DOWN'} color={isUp ? '#34d399' : '#f87171'} />
            <Metric label="HTTP Code" value={latestCheck ? latestCheck.http_status_code || 'ERR' : '—'} />
            <Metric label="Checks · window" value={checks.length} />
            <Metric label="Last Check" value={latestCheck ? new Date(latestCheck.timestamp).toLocaleTimeString() : '—'} />
          </div>

          <div className="mt-4">
            <span className="micro">Recent probes</span>
            <div className="mt-2">
              <StatusStrip checks={checks} bars={48} />
            </div>
          </div>
        </div>
      </div>

      {/* Reports */}
      <div className="panel-flush mt-3 animate-fade-up" style={{ animationDelay: '240ms' }}>
        <div className="panel-head">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-txt-hi">SLA Reports</span>
            <span className="font-mono text-[11px] text-txt-dim">[{reports.length}]</span>
          </div>
        </div>

        {/* Generate toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="micro text-txt-lo">Period</span>
            <div className="flex overflow-hidden rounded-md border border-white/[0.08]">
              {([1, 7, 30] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setGenDays(d)}
                  disabled={generating}
                  className={`px-2.5 py-1 font-mono text-[10px] font-bold uppercase transition-colors disabled:opacity-50 ${
                    genDays === d ? 'bg-accent/[0.12] text-accent' : 'text-txt-lo hover:text-txt-mid'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <button onClick={handleGenerate} disabled={generating} className="btn-accent">
              {generating ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <Zap className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
              {generating ? 'Generating' : 'Generate'}
            </button>
          </div>
          {reports.length > 0 && (
            <button onClick={exportCsv} disabled={generating} className="btn-ghost">
              <Sheet className="h-3.5 w-3.5" strokeWidth={1.75} />
              Export CSV
            </button>
          )}
        </div>

        {genMsg && (
          <div
            className={`mx-4 mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-[12px] ${
              genMsg.type === 'success'
                ? 'border-ok/25 bg-ok/[0.06] text-ok'
                : genMsg.type === 'error'
                ? 'border-crit/25 bg-crit/[0.06] text-crit'
                : 'border-white/[0.1] bg-white/[0.03] text-txt-mid'
            }`}
          >
            {genMsg.type === 'info' && (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {genMsg.text}
          </div>
        )}

        {reports.length === 0 && !loading && (
          <div className="px-4 py-12 text-center font-mono text-[12px] text-txt-dim">
            No reports yet — generate one above, or the weekly report lands Monday 08:00 UTC.
          </div>
        )}

        {reports.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Report', 'Uptime', 'Avg', 'P95', 'Incidents', 'Downtime', 'Severity', 'Result', 'Files'].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 font-mono text-[9px] font-bold uppercase tracking-wider text-txt-dim ${
                        i === 0 ? 'text-left' : 'text-right'
                      } ${h === 'Severity' ? '!text-left' : ''}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedReports.map((r) => {
                  const sev = SEVERITY[r.severity] ?? SEVERITY.healthy
                  return (
                    <tr key={r.report_id} className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-left font-mono text-[12px] font-semibold text-txt-hi">{r.report_id}</td>
                      <td className="px-4 py-3 text-right data text-[12px] text-txt-mid">{r.uptime_pct.toFixed(2)}%</td>
                      <td className="px-4 py-3 text-right data text-[12px] text-txt-mid">{r.avg_latency_ms}ms</td>
                      <td className="px-4 py-3 text-right data text-[12px] text-txt-mid">{r.p95_latency_ms}ms</td>
                      <td className="px-4 py-3 text-right data text-[12px] text-txt-mid">{r.incident_count}</td>
                      <td className="px-4 py-3 text-right data text-[12px] text-txt-mid">{formatDowntime(r.total_downtime_sec)}</td>
                      <td className="px-4 py-3 text-left">
                        <span
                          className="inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
                          style={{ color: sev.color, borderColor: `${sev.color}40`, background: sev.dim }}
                        >
                          <span className="w-[3px] rounded-full" style={{ height: '0.6rem', background: sev.color }} />
                          {sev.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-mono text-[11px] font-bold ${r.sla_pass ? 'text-ok' : 'text-crit'}`}>
                          {r.sla_pass ? 'PASS' : 'FAIL'}
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
                                className="inline-flex items-center gap-1 rounded border border-white/[0.08] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-txt-lo transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
                              >
                                {busy ? (
                                  <div className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
                                ) : (
                                  <Download className="h-2.5 w-2.5" strokeWidth={2} />
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  CircleDashed,
  Download,
  Sheet,
  Radio,
} from 'lucide-react'
import Shell from '../components/Shell'
import TickerStat from '../components/TickerStat'
import MagicBento from '../components/MagicBento'
import Counter from '../components/Counter'
import FlipClock from '../components/FlipClock'
import { BentoFigure, BentoArea, BentoBars, BentoMeter } from '../components/BentoVisuals'
import LatencyChart from '../components/LatencyChart'
import UptimeGauge from '../components/UptimeGauge'
import StatusStrip from '../components/StatusStrip'
import IncidentTimeline from '../components/IncidentTimeline'
import {
  getProject,
  getProjectStatus,
  getProjectReports,
  getProjectIncidents,
  updateProject,
  deleteProject,
  generateReport,
  getReportDownloadUrl,
} from '../lib/api'
import { Alert, Spinner } from '../components/ui'
import type { ProjectStatus, ProjectReport, Project, UpdateProjectInput, Incident, ReliabilityMetrics } from '../types'
import { SEVERITY, STATUS, PROJECT_DEFAULTS, POLL_INTERVAL_MS, uptimeFromChecks, evidenceFromChecks, verdictFromStatus, VERDICT, bareUrl, fmtUtcTime, formatDowntime } from '../lib/format'

/** Incident/reliability window is fixed (independent of the latency chart toggle). */
const INCIDENT_WINDOW_DAYS = 30

/** Header status pill: border, wash and text per verdict. */
const HEADER_BADGE = {
  up: { classes: 'border-ok/25 bg-ok/[0.08] text-ok' },
  down: { classes: 'border-crit/25 bg-crit/[0.08] text-crit' },
  inconclusive: { classes: 'border-white/[0.12] bg-white/[0.04] text-txt-lo' },
  pending: { classes: 'border-white/[0.12] bg-white/[0.04] text-txt-lo' },
} as const

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
    accepted_status: project.accepted_status ?? '200-399',
    notification_email: project.notification_email ?? '',
    thresholds: {
      min_uptime_pct: project.thresholds?.min_uptime_pct ?? PROJECT_DEFAULTS.min_uptime_pct,
      max_avg_latency_ms: project.thresholds?.max_avg_latency_ms ?? PROJECT_DEFAULTS.max_avg_latency_ms,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label="Edit endpoint" className="panel frame-corners w-full max-w-lg animate-scale-in overflow-hidden">
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
          <button onClick={onClose} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-md text-txt-lo transition-colors hover:bg-white/[0.05] hover:text-txt-hi">
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="field-label" htmlFor="edit-name">Name</label>
            <input id="edit-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" />
          </div>
          <div>
            <label className="field-label" htmlFor="edit-url">Target URL</label>
            <input id="edit-url" type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="field" />
          </div>
          <div>
            <label className="field-label" htmlFor="edit-accepted">Accepted HTTP statuses</label>
            <input
              id="edit-accepted"
              type="text"
              value={form.accepted_status ?? ''}
              onChange={(e) => setForm({ ...form, accepted_status: e.target.value })}
              className="field"
              placeholder="200-399"
            />
            <p className="mt-1.5 text-[10px] text-txt-dim">
              Ranges or codes, comma separated. Other responses count as down. Changes apply to new checks only.
            </p>
          </div>
          <div>
            <label className="field-label" htmlFor="edit-email">Notification email</label>
            <input id="edit-email" type="email" value={form.notification_email} onChange={(e) => setForm({ ...form, notification_email: e.target.value })} className="field" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label" htmlFor="edit-threshold">Failure threshold</label>
              <input id="edit-threshold" type="number" min={1} max={10} value={form.failure_threshold} onChange={(e) => setForm({ ...form, failure_threshold: Number(e.target.value) })} className="field" />
            </div>
            <div>
              <label className="field-label" htmlFor="edit-uptime">Min uptime %</label>
              <input
                id="edit-uptime"
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
            <label className="field-label" htmlFor="edit-latency">Max latency (ms)</label>
            <input
              id="edit-latency"
              type="number"
              min={0}
              value={form.thresholds?.max_avg_latency_ms}
              onChange={(e) => setForm({ ...form, thresholds: { ...form.thresholds!, max_avg_latency_ms: Number(e.target.value) } })}
              className="field"
            />
          </div>

          {error && <Alert tone="error">{error}</Alert>}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/[0.06] bg-white/[0.01] px-5 py-4">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-accent">
            {saving && <Spinner />}
            {saving ? 'Saving…' : 'Save changes'}
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
  error: string | null
}

function DeleteModal({ projectName, onClose, onConfirm, deleting, error }: DeleteModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !deleting && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, deleting])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && !deleting && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label="Confirm delete" className="panel w-full max-w-sm animate-scale-in overflow-hidden border-crit/25">
        <div className="flex items-center gap-2.5 border-b border-crit/20 bg-crit/[0.05] px-5 h-11">
          <TriangleAlert className="h-4 w-4 text-crit" strokeWidth={1.75} />
          <span className="text-[13px] font-semibold text-crit">Confirm delete</span>
        </div>
        <div className="space-y-2 p-5">
          <p className="text-[13px] leading-relaxed text-txt-mid">
            This stops monitoring <span className="font-semibold text-accent">{projectName}</span>.
            Its check history and reports are kept.
          </p>
          {error && <Alert tone="error">{error}</Alert>}
        </div>
        <div className="flex justify-end gap-2 border-t border-white/[0.06] px-5 py-4">
          <button onClick={onClose} disabled={deleting} className="btn-ghost">Cancel</button>
          <button onClick={onConfirm} disabled={deleting} className="btn-danger">
            {deleting && <Spinner />}
            {deleting ? 'Deleting…' : 'Delete endpoint'}
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
      <span className="text-[12px] font-medium text-txt-lo">{label}</span>
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
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [reliability, setReliability] = useState<ReliabilityMetrics | null>(null)
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

  /** Epoch ms of the moment the last incident resolved, or of the endpoint's
   *  creation when it has never had one. `null` means we cannot say yet. */
  const incidentFreeSince = useMemo(() => {
    if (!project) return null
    const resolved = incidents.filter((i) => i.resolved && i.end_time != null)
    if (resolved.length === 0) {
      const created = new Date(project.created_at).getTime()
      return Number.isNaN(created) ? null : created
    }
    return Math.max(...resolved.map((i) => (i.end_time as number) * 1000))
  }, [incidents, project])

  /** Incident durations in minutes, oldest first — the shape of the instability. */
  const incidentDurations = useMemo(
    () =>
      incidents
        .filter((i) => i.duration_seconds != null)
        .slice()
        .sort((a, b) => a.start_time - b.start_time)
        .map((i) => Math.round(((i.duration_seconds as number) / 60) * 10) / 10),
    [incidents],
  )

  /** Healthy gaps between consecutive resolved incidents, in hours. */
  const incidentGaps = useMemo(() => {
    const resolved = incidents
      .filter((i) => i.resolved && i.end_time != null)
      .slice()
      .sort((a, b) => a.start_time - b.start_time)
    const gaps: number[] = []
    for (let i = 1; i < resolved.length; i++) {
      gaps.push(Math.round(((resolved[i].start_time - (resolved[i - 1].end_time as number)) / 3600) * 10) / 10)
    }
    return gaps
  }, [incidents])

  const loadData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!id) return
      // Sequence counter: switching the time window mid-flight starts a new
      // request, and only the latest one is allowed to land.
      const seq = ++requestSeq.current
      if (options?.silent) setRefreshing(true)
      else setLoading(true)
      try {
        const [projectData, statusData, reportsData, incidentsData] = await Promise.all([
          getProject(id),
          getProjectStatus(id, hours),
          getProjectReports(id),
          getProjectIncidents(id, INCIDENT_WINDOW_DAYS),
        ])
        if (seq !== requestSeq.current) return
        setProject(projectData)
        setStatus(statusData)
        setReports(reportsData)
        setIncidents(incidentsData.incidents)
        setReliability(incidentsData.metrics)
        setLoadError(null)
      } catch (e) {
        if (seq !== requestSeq.current) return
        setLoadError(e instanceof Error ? e.message : 'Failed to load endpoint')
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
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete endpoint')
    }
  }

  const checks = status?.checks || []
  const latestCheck = checks[checks.length - 1]
  const verdict = verdictFromStatus(status?.current_status)
  const isUp = verdict === 'up'
  const isDownState = verdict === 'down'
  const summary = status?.summary
  // The API measures coverage against the checks the schedule should have
  // produced; the fallback only knows about the checks that came back.
  const coverage = summary?.coverage_pct ?? evidenceFromChecks(checks)
  const uptime = uptimeFromChecks(checks)
  const sortedReports = [...reports].sort((a, b) => b.generated_at.localeCompare(a.generated_at))

  // Window aggregates over successful checks only — failures report timeout
  // values that would poison the averages.
  const windowStats = useMemo(() => {
    const okLatencies = (status?.checks || [])
      .filter((c) => c.status === 'success')
      .map((c) => c.latency_ms)
      .sort((a, b) => a - b)
    if (okLatencies.length === 0) return { avg: null as number | null, p95: null as number | null }
    const avg = Math.round(okLatencies.reduce((s, v) => s + v, 0) / okLatencies.length)
    const p95 = okLatencies[Math.min(Math.floor(okLatencies.length * 0.95), okLatencies.length - 1)]
    return { avg, p95 }
  }, [status])
  const latencyTarget = project?.thresholds?.max_avg_latency_ms ?? PROJECT_DEFAULTS.max_avg_latency_ms

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
      <TickerStat
        label="Status"
        value={status ? VERDICT[verdict].short : '—'}
        color={status ? VERDICT[verdict].color : undefined}
      />
      <TickerStat label="Latency" value={latestCheck ? `${latestCheck.latency_ms}ms` : '—'} />
      <TickerStat label="Reports" value={String(reports.length)} />
    </>
  )

  // Initial load failed and there is nothing to show — a clean error state
  // beats an eternal "Loading…" header.
  if (!project && !loading && loadError) {
    return (
      <Shell ticker={ticker}>
        <div className="panel mx-auto mt-16 flex max-w-md flex-col items-center gap-4 p-8 text-center">
          <TriangleAlert className="h-6 w-6 text-crit" strokeWidth={1.75} />
          <div>
            <p className="font-display text-[15px] font-semibold text-txt-hi">Couldn't load this endpoint</p>
            <p className="mt-1 text-[12px] text-txt-lo">{loadError}</p>
          </div>
          <div className="flex gap-2">
            <Link to="/dashboard" className="btn-ghost">Back to overview</Link>
            <button onClick={() => loadData()} className="btn-accent">Retry</button>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell ticker={ticker}>
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
            <h1 className="text-sheen font-display text-[26px] font-bold tracking-tight">{project?.name || 'Loading…'}</h1>
            {project && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider ${
                  HEADER_BADGE[verdict].classes
                }`}
              >
                {isUp ? (
                  <CircleCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
                ) : isDownState ? (
                  <CircleAlert className="h-3.5 w-3.5" strokeWidth={1.75} />
                ) : (
                  <CircleDashed className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
                {VERDICT[verdict].label}
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
              {refreshing ? 'Refreshing' : 'Refresh'}
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
      <div className="mt-5 grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
        {/* Chart */}
        <div className="panel-flush self-start lg:col-span-2 animate-fade-up" style={{ animationDelay: '120ms' }}>
          <div className="panel-head">
            <span className="text-[13px] font-semibold text-txt-hi">Latency Analytics</span>
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
              <div className="grid h-[260px] place-items-center text-accent">
                <Spinner size={24} />
              </div>
            ) : (
              <LatencyChart checks={checks} />
            )}
          </div>
        </div>

        {/* Vitals */}
        <div className="panel animate-fade-up p-5" style={{ animationDelay: '180ms' }}>
          <span className="text-[13px] font-semibold text-txt-hi">Vitals</span>
          <div className="hr-accent mt-3" />

          <div className="mt-4 flex justify-center">
            <UptimeGauge value={uptime} label={`Uptime · ${hours}h`} />
          </div>
          {summary && (
            <p className="mt-2 text-center font-mono text-[10px] text-txt-dim">
              {summary.checks_up + summary.checks_down} of {summary.checks_expected} expected checks were conclusive
            </p>
          )}

          <div className="mt-4">
            <Metric label="Current Latency" value={latestCheck ? `${latestCheck.latency_ms}ms` : '—'} />
            <Metric
              label={`Avg · ${hours}h`}
              value={windowStats.avg != null ? `${windowStats.avg}ms` : '—'}
              color={windowStats.avg != null && windowStats.avg > latencyTarget ? STATUS.warn : undefined}
            />
            <Metric label={`P95 · ${hours}h`} value={windowStats.p95 != null ? `${windowStats.p95}ms` : '—'} />
            <Metric label="Status" value={status ? VERDICT[verdict].short : '—'} color={status ? VERDICT[verdict].color : undefined} />
            <Metric
              label={`Evidence · ${hours}h`}
              value={coverage != null ? `${coverage.toFixed(1)}%` : '—'}
              color={coverage != null && coverage < 95 ? STATUS.warn : undefined}
            />
            <Metric label="HTTP Code" value={latestCheck ? latestCheck.http_status_code || 'ERR' : '—'} />
            <Metric
              label="Checks · window"
              value={summary ? `${summary.checks_total} / ${summary.checks_expected}` : checks.length}
            />
            <Metric label="Last Check" value={latestCheck ? fmtUtcTime(latestCheck.timestamp) : '—'} />
            <Metric
              label="Cert Expires"
              value={project?.cert_expiry_days != null ? `${project.cert_expiry_days}d` : '—'}
              color={
                project?.cert_expiry_days == null
                  ? undefined
                  : project.cert_expiry_days < 7
                    ? STATUS.crit
                    : project.cert_expiry_days < 30
                      ? STATUS.warn
                      : undefined
              }
            />
            <Metric label="Cert Issuer" value={project?.cert_issuer || '—'} />
          </div>

          <div className="mt-4">
            <span className="text-[12px] font-medium text-txt-lo">Recent probes</span>
            <div className="mt-2">
              <StatusStrip checks={checks} bars={48} />
            </div>
          </div>
        </div>
      </div>

      {/* Reliability */}
      <div className="mt-8 flex items-center gap-3 animate-fade-up" style={{ animationDelay: '250ms' }}>
        <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-txt-hi">Reliability</h2>
        <span className="rounded-md border border-white/[0.08] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-txt-mid">
          {INCIDENT_WINDOW_DAYS}d
        </span>
        <span className="hr-accent flex-1" />
      </div>

      {reliability?.open_incident && (
        <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-crit/25 bg-crit/[0.05] px-4 py-3 animate-fade-up">
          <Radio className="h-4 w-4 animate-pulse text-crit" strokeWidth={2} />
          <span className="font-mono text-[12px] font-semibold text-crit">
            Incident in progress — this endpoint is currently failing checks.
          </span>
        </div>
      )}

      {/* Incident-free streak — a flip clock counting up since the last incident */}
      <div className="mt-3">
        <FlipClock
          since={incidentFreeSince}
          open={Boolean(reliability?.open_incident)}
          label="No recorded incidents in"
        />
      </div>

      <MagicBento
        columns={4}
        rowHeight={176}
        gap={12}
        radius={18}
        minCell={190}
        spotlightRadius={260}
        className="mt-3"
        items={[
          {
            id: 'mttr',
            title: 'MTTR',
            description: 'Mean time to recovery, per incident.',
            visual: (
              <>
                <BentoFigure
                  value={
                    reliability ? (
                      <Counter
                        value={reliability.mttr_sec / 60}
                        decimals={1}
                        suffix="min"
                        direction="up"
                        duration={0.9}
                        bounce={0.28}
                        stagger={0.03}
                        fade={0.24}
                        fontSize={24}
                        fontWeight={600}
                        tabular
                        motionBlur
                      />
                    ) : (
                      '—'
                    )
                  }
                  note={incidentDurations.length > 1 ? `${incidentDurations.length} incidents` : undefined}
                />
                <BentoArea values={incidentDurations} color={STATUS.warn} />
              </>
            ),
          },
          {
            id: 'mtbf',
            title: 'MTBF',
            description: 'Healthy time between failures.',
            visual: (
              <>
                <BentoFigure
                  value={
                    reliability && reliability.mtbf_sec != null ? (
                      <Counter
                        value={reliability.mtbf_sec / 3600}
                        decimals={1}
                        suffix="h"
                        direction="up"
                        duration={0.9}
                        bounce={0.28}
                        stagger={0.03}
                        fade={0.24}
                        fontSize={24}
                        fontWeight={600}
                        tabular
                        motionBlur
                      />
                    ) : (
                      '—'
                    )
                  }
                  note={incidentGaps.length >= 2 ? 'per gap' : undefined}
                />
                <BentoBars values={incidentGaps.length ? incidentGaps : [0]} color={STATUS.ok} />
              </>
            ),
          },
          {
            id: 'longest',
            title: 'Longest outage',
            description: `Worst single incident in ${INCIDENT_WINDOW_DAYS} days.`,
            visual: (
              <>
                <BentoFigure
                  value={
                    reliability ? (
                      <Counter
                        value={reliability.longest_outage_sec / 60}
                        decimals={1}
                        suffix="min"
                        direction="up"
                        duration={0.9}
                        bounce={0.28}
                        stagger={0.03}
                        fade={0.24}
                        fontSize={24}
                        fontWeight={600}
                        tabular
                        motionBlur
                      />
                    ) : (
                      '—'
                    )
                  }
                  note={reliability ? `${reliability.incident_count} total` : undefined}
                />
                <BentoBars values={incidentDurations.length ? incidentDurations : [0]} color={STATUS.crit} />
              </>
            ),
          },
          {
            id: 'budget',
            title: 'Error budget',
            description: 'Share of the allowed downtime already spent.',
            visual: (
              <>
                <BentoFigure
                  value={
                    reliability ? (
                      <Counter
                        value={reliability.error_budget.burn_pct}
                        decimals={1}
                        suffix="%"
                        direction="up"
                        duration={0.9}
                        bounce={0.28}
                        stagger={0.03}
                        fade={0.24}
                        fontSize={24}
                        fontWeight={600}
                        tabular
                        motionBlur
                      />
                    ) : (
                      '—'
                    )
                  }
                  note={
                    reliability
                      ? reliability.error_budget.ok
                        ? `${formatDowntime(reliability.error_budget.remaining_sec)} left`
                        : `${formatDowntime(Math.abs(reliability.error_budget.remaining_sec))} over`
                      : undefined
                  }
                />
                <BentoMeter
                  pct={reliability ? reliability.error_budget.burn_pct : 0}
                  color={reliability?.error_budget.ok ? STATUS.ok : STATUS.crit}
                />
              </>
            ),
          },
        ]}
      />

      {/* Incident log */}
      <div className="mt-3">
        <IncidentTimeline incidents={incidents} />
      </div>

      {/* Reports */}
      <div className="panel-flush mt-3 animate-fade-up" style={{ animationDelay: '240ms' }}>
        <div className="panel-head">
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-semibold text-txt-hi">SLA Reports</span>
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
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="btn-accent h-7 text-[10px]"
            >
              {generating ? 'Generating…' : 'Generate Report'}
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
          <Alert tone={genMsg.type} className="mx-4 mt-3">
            {genMsg.text}
          </Alert>
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

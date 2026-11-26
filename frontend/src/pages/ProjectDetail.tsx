import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  RefreshCw,
  SquarePen,
  X,
  TriangleAlert,
  ExternalLink,
  ChevronRight,
  Download,
  Sheet,
  ClockAlert,
  CircleOff,
} from 'lucide-react'
import Shell from '../components/Shell'
import TickerStat from '../components/TickerStat'
import FlipClock from '../components/FlipClock'
import IncidentReport from '../components/IncidentReport'
import HourHeatmap from '../components/HourHeatmap'
import HowCalculated from '../components/HowCalculated'
import IncidentState from '../components/IncidentState'
import DayStrip from '../components/DayStrip'
import RubberSegment from '../components/RubberSegment'
import UseAnimations from 'react-useanimations'
import checkCircle from 'react-useanimations/lib/checkCircle'
import alertOctagon from 'react-useanimations/lib/alertOctagon'
import alertTriangle from 'react-useanimations/lib/alertTriangle'
import ActionButton from '../components/ActionButton'
import MagicBento, { type MagicBentoItem } from '../components/MagicBento'
import Counter from '../components/Counter'
import StatusStrip from '../components/StatusStrip'
import { BentoFigure, BentoComposition, BentoBand, BentoGauge } from '../components/BentoVisuals'
import HoldButton from '../components/HoldButton'
import LatencyChart from '../components/LatencyChart'
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
import type { Check, ProjectStatus, ProjectReport, Project, UpdateProjectInput, Incident, ReliabilityMetrics } from '../types'
import { SEVERITY, STATUS, PROJECT_DEFAULTS, POLL_INTERVAL_MS, uptimeFromChecks, evidenceFromChecks, verdictFor, VERDICT, bareUrl, fmtUtcTime, fmtUtcDay, formatDowntime, timeAgo, STALE_AFTER_MS, type Verdict } from '../lib/format'

/** Incident/reliability window is fixed (independent of the latency chart toggle). */
const INCIDENT_WINDOW_DAYS = 30

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

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  const index = (sorted.length - 1) * p
  const low = Math.floor(index)
  const high = Math.ceil(index)
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (index - low)
}

const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Body of one vitals tile: figure on top, instrument centred in the middle, a
 *  mono caption row at the bottom, so all four tiles line up with each other. */
function VitalBody({ figure, caption, children }: { figure: ReactNode; caption: ReactNode[]; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      {figure}
      <div className="flex min-h-0 flex-1 flex-col justify-center">{children}</div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 whitespace-nowrap font-mono text-[11px] tabular-nums text-txt-lo">
        {caption}
      </div>
    </div>
  )
}

/** Verdict names short enough to sit in a vitals figure beside their note. */
const FIGURE_LABEL: Record<keyof typeof VERDICT, string> = {
  up: 'Operational',
  down: 'Down',
  inconclusive: 'No evidence',
  stale: 'Stale',
  off: 'Not monitored',
  pending: 'Pending',
}

const CHECK_WORD = { success: 'up', failure: 'down', inconclusive: 'no evidence' } as const

const DAY_LEGEND = [
  ['Operational', 'bg-ok/70'],
  ['Thin (under half the checks)', 'bg-ok/30'],
  ['Outage', 'bg-crit/80'],
  ['No data', 'bg-white/20'],
  ['Not tracked', 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]'],
] as const

/** The Status figure's note: the latest response while it is current, its age once it is not. */
function statusNote(verdict: Verdict, latest: Check | undefined, monitored: boolean): string | undefined {
  if (!latest) return verdict === 'stale' ? 'no recent checks' : undefined
  if (verdict === 'stale' || !monitored) {
    const ago = timeAgo(latest.timestamp)
    return `last check ${ago === 'now' ? 'just now' : `${ago} ago`}`
  }
  return latest.http_status_code ? `HTTP ${latest.http_status_code}` : 'no response'
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hours, setHours] = useState(24)
  const [heatMetric, setHeatMetric] = useState('Uptime')
  // Captured on every poll, failed ones too, so data that stops changing ages into STALE.
  const [now, setNow] = useState(Date.now)
  const requestSeq = useRef(0)

  const [showEdit, setShowEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [genDays, setGenDays] = useState<1 | 7 | 30>(7)
  const [reportDays, setReportDays] = useState<7 | 30>(7)
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

  const loadData = useCallback(
    async () => {
      if (!id) return
      // Sequence counter: switching the time window mid-flight starts a new
      // request, and only the latest one is allowed to land.
      const seq = ++requestSeq.current
      setLoading(true)
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
          setLoading(false)
          setNow(Date.now())
        }
      }
    },
    [hours, id]
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    // A hidden tab gets refetched by the visibility listener below, so polling
    // it in the background is a fetch plus a full re-render for nobody.
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadData()
    }, POLL_INTERVAL_MS)
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
  const verdict: Verdict =
    project && status
      ? verdictFor(
          {
            ...project,
            current_status: status.current_status,
            // The window's newest check; an empty window falls back to created_at.
            last_checked_at: latestCheck?.timestamp ?? null,
            open_incident: reliability?.open_incident,
          },
          now,
        )
      : 'pending'
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
    if (okLatencies.length === 0) {
      return { avg: null as number | null, p50: null as number | null, p95: null as number | null }
    }
    const avg = Math.round(okLatencies.reduce((s, v) => s + v, 0) / okLatencies.length)
    const p50 = Math.round(percentile(okLatencies, 0.5) as number)
    const p95 = okLatencies[Math.min(Math.floor(okLatencies.length * 0.95), okLatencies.length - 1)]
    return { avg, p50, p95 }
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
      'incident_count', 'total_downtime_sec', 'severity', 'sla_pass', 'slo_status', 'generated_at',
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

  /** One bucket per 5 minutes (1h view) or per hour, carrying both the uptime
   *  for the heatmap and the latency percentiles for the vitals chart. Derived
   *  from the checks already in hand — no extra request. */
  const windowBuckets = useMemo(() => {
    const size = hours <= 1 ? 5 * 60_000 : 60 * 60_000
    const map = new Map<number, { up: number; conclusive: number; total: number; latencies: number[] }>()
    for (const check of checks) {
      const key = Math.floor(check.timestamp / size) * size
      const bucket = map.get(key) ?? { up: 0, conclusive: 0, total: 0, latencies: [] }
      bucket.total += 1
      if (check.status === 'success') {
        bucket.up += 1
        bucket.conclusive += 1
      } else if (check.status === 'failure') {
        bucket.conclusive += 1
      }
      // Successful checks only, like windowStats: a timeout records a synthetic
      // latency that would flatten every real value in the band.
      if (check.status === 'success' && check.latency_ms != null) {
        bucket.latencies.push(check.latency_ms)
      }
      map.set(key, bucket)
    }
    return [...map.keys()]
      .sort((a, b) => a - b)
      .map((key) => {
        const bucket = map.get(key)!
        bucket.latencies.sort((a, b) => a - b)
        return {
          key: String(key),
          label: `${new Date(key).toISOString().slice(11, 16)} UTC`,
          uptime: bucket.conclusive > 0 ? (bucket.up / bucket.conclusive) * 100 : null,
          checks: bucket.total,
          conclusive: bucket.conclusive,
          p50: percentile(bucket.latencies, 0.5),
          p95: percentile(bucket.latencies, 0.95),
        }
      })
  }, [checks, hours])

  /** Percentile bands for the vitals chart. Buckets with no measured check
   *  carry the previous value forward, so a gap does not plunge the line to 0. */
  const latencyTrend = useMemo(() => {
    if (windowBuckets.length === 0) return null
    const carry = (pick: (bucket: (typeof windowBuckets)[number]) => number | null) => {
      let last = 0
      let seen = false
      return windowBuckets.map((bucket) => {
        const value = pick(bucket)
        if (value != null) {
          last = value
          seen = true
        }
        return seen ? last : 0
      })
    }
    return {
      labels: windowBuckets.map((bucket) => bucket.label),
      p50: carry((bucket) => bucket.p50),
      p95: carry((bucket) => bucket.p95),
    }
  }, [windowBuckets])

  const ticker = (
    <>
      <TickerStat
        label="Status"
        value={status ? VERDICT[verdict].short : '—'}
        color={status ? VERDICT[verdict].color : undefined}
      />
      <TickerStat
        label="Uptime"
        value={uptime != null ? `${uptime.toFixed(1)}%` : '—'}
        color={uptime == null ? undefined : uptime >= 99.9 ? STATUS.ok : STATUS.warn}
      />
      <TickerStat label="Avg" value={windowStats.avg != null ? `${windowStats.avg}ms` : '—'} />
      <TickerStat
        label="P95"
        value={windowStats.p95 != null ? `${windowStats.p95}ms` : '—'}
        color={windowStats.p95 != null && windowStats.p95 > latencyTarget ? STATUS.warn : undefined}
        className="hidden md:flex"
      />
      <TickerStat
        label="Coverage"
        value={coverage != null ? `${coverage.toFixed(0)}%` : '—'}
        color={coverage != null && coverage < 95 ? STATUS.warn : undefined}
        className="hidden lg:flex"
      />
      <TickerStat
        label="Incidents"
        value={String(reliability?.incident_count ?? 0)}
        color={reliability?.open_incident ? STATUS.crit : undefined}
        className="hidden sm:flex"
      />
      <TickerStat
        label="Budget"
        value={reliability ? `${reliability.error_budget.burn_pct.toFixed(0)}%` : '—'}
        color={
          reliability ? (reliability.error_budget.ok ? STATUS.ok : STATUS.crit) : undefined
        }
        className="hidden xl:flex"
      />
    </>
  )

  // ─── Vitals: four instruments for the selected window ──────────────────────
  const uptimeValue = summary ? summary.uptime_pct : uptime
  const expected = summary?.checks_expected ?? checks.length
  const recorded = summary ? summary.checks_up + summary.checks_down + summary.checks_inconclusive : checks.length
  const budget = reliability?.error_budget
  // Floored, so a budget that has lost anything never reads as a full 100%.
  const budgetLeft = budget ? Math.floor(Math.max(0, 100 - budget.burn_pct)) : null
  const budgetColor =
    !budget || budgetLeft == null
      ? STATUS.neutral
      : !budget.ok
        ? STATUS.crit
        : budgetLeft >= 50
          ? STATUS.ok
          : STATUS.warn
  const certColor =
    project?.cert_expiry_days == null
      ? undefined
      : project.cert_expiry_days < 7
        ? STATUS.crit
        : project.cert_expiry_days < 30
          ? STATUS.warn
          : undefined
  const odometer = {
    direction: 'up',
    duration: 0.9,
    bounce: 0.28,
    stagger: 0.03,
    fade: 0.24,
    fontSize: 24,
    fontWeight: 600,
    tabular: true,
    motionBlur: true,
  } as const
  const fmtCount = (n: number) => n.toLocaleString('en-US')
  const latestAgo = latestCheck ? timeAgo(latestCheck.timestamp) : null
  const budgetShare = budget ? +(100 - budget.min_uptime_pct).toFixed(4) : null

  const vitals: MagicBentoItem[] = [
    {
      id: 'status',
      title: (
        <HowCalculated
          label="Status"
          topic="the status"
          rows={[
            {
              label: 'Latest check',
              value: latestCheck
                ? `${CHECK_WORD[latestCheck.status]} · ${latestAgo === 'now' ? 'just now' : `${latestAgo} ago`}`
                : 'none in this window',
            },
            { label: 'Stale after', value: `${STALE_AFTER_MS / 1000} s` },
            ...(project?.active === false ? [{ label: 'Monitoring', value: 'stopped (deleted or paused)' }] : []),
          ]}
          result={`= ${FIGURE_LABEL[verdict]}`}
          caveat={`No check for ${STALE_AFTER_MS / 1000} s reads Stale, so a monitor that stopped never stays green.`}
        />
      ),
      description: (
        <>
          Accepts {project?.accepted_status || '200-399'}
          {project?.cert_expiry_days != null && (
            <>
              {' · '}
              <span style={{ color: certColor }}>TLS {project.cert_expiry_days}d</span>
            </>
          )}
        </>
      ),
      visual: (
        <VitalBody
          figure={
            <BentoFigure
              value={status ? <span style={{ color: VERDICT[verdict].color }}>{FIGURE_LABEL[verdict]}</span> : '—'}
              muted={!status}
              note={statusNote(verdict, latestCheck, project?.active !== false)}
            />
          }
          caption={[
            <span key="n">
              {checks.length ? `last ${Math.min(30, checks.length)} checks` : verdict === 'pending' ? 'no checks yet' : 'none in window'}
            </span>,
            <span key="t">{latestCheck ? fmtUtcTime(latestCheck.timestamp) : '—'}</span>,
          ]}
        >
          <StatusStrip checks={checks} bars={30} latencyTarget={latencyTarget} interactive />
        </VitalBody>
      ),
    },
    {
      id: 'uptime',
      title: (
        <HowCalculated
          label="Uptime & evidence"
          topic="uptime"
          empty={!summary || summary.checks_total === 0 ? 'No checks in this window yet' : false}
          rows={
            summary
              ? [
                  { label: 'Up', value: fmtCount(summary.checks_up) },
                  { label: 'Down', value: fmtCount(summary.checks_down) },
                  { label: 'No evidence', value: fmtCount(summary.checks_inconclusive) },
                  { label: 'Expected', value: fmtCount(summary.checks_expected) },
                ]
              : []
          }
          result={
            summary && (
              <>
                {summary.checks_up + summary.checks_down === 0 ? (
                  'uptime: no conclusive checks'
                ) : (
                  <>
                    uptime = {fmtCount(summary.checks_up)} ÷ {fmtCount(summary.checks_up + summary.checks_down)} ={' '}
                    {uptimeValue == null ? '—' : `${uptimeValue.toFixed(2)}%`}
                  </>
                )}
                {/* A line break is silent to a screen reader; this keeps the two formulas apart. */}
                <span className="sr-only">; </span>
                <br />
                evidence = {fmtCount(summary.checks_up + summary.checks_down)} ÷ {fmtCount(summary.checks_expected)} ={' '}
                {coverage == null ? '—' : `${coverage.toFixed(1)}%`}
              </>
            )
          }
          caveat="Checks with no evidence (a block page, a probe-side error) count toward neither side of uptime."
        />
      ),
      description: `Conclusive checks · last ${hours}h`,
      visual: (
        <VitalBody
          figure={
            <BentoFigure
              value={uptimeValue == null ? '—' : <Counter value={uptimeValue} decimals={2} suffix="%" {...odometer} />}
              muted={uptimeValue == null}
              note={
                !recorded
                  ? 'no checks yet'
                  : summary && summary.checks_down > 0
                    ? `${fmtCount(summary.checks_down)} down`
                    : 'no failures'
              }
            />
          }
          caption={[
            <span key="n" className="text-txt-mid">
              {fmtCount(recorded)} / {fmtCount(expected)} checks
            </span>,
            <span key="e" style={{ color: coverage == null ? STATUS.neutral : coverage >= 95 ? STATUS.ok : STATUS.warn }}>
              {coverage == null ? '—' : `${coverage.toFixed(1)}%`} evidence
            </span>,
          ]}
        >
          <BentoComposition
            expected={expected}
            parts={[
              { key: 'up', label: 'Up', value: summary?.checks_up ?? 0, color: STATUS.ok },
              { key: 'down', label: 'Down', value: summary?.checks_down ?? 0, color: STATUS.crit },
              { key: 'none', label: 'No answer', value: summary?.checks_inconclusive ?? 0, color: STATUS.neutral },
            ]}
          />
        </VitalBody>
      ),
    },
    {
      id: 'latency',
      title: (
        <HowCalculated
          label="Latency"
          topic="latency"
          empty={windowStats.avg == null ? 'No successful checks in this window' : false}
          rows={[
            { label: 'Successful checks', value: fmtCount(summary?.checks_up ?? 0) },
            { label: 'p50 · p95', value: `${windowStats.p50} · ${windowStats.p95} ms` },
          ]}
          result={
            windowStats.avg != null &&
            `avg ${windowStats.avg} ms ${windowStats.avg > latencyTarget ? '>' : '≤'} ${latencyTarget} ms target`
          }
          caveat="Only successful checks count: a timeout records 10 s, which was never measured."
        />
      ),
      description:
        windowStats.avg == null ? (
          `No samples yet · target ${latencyTarget}ms`
        ) : (
          <>
            Avg <span style={{ color: windowStats.avg > latencyTarget ? STATUS.warn : undefined }}>{windowStats.avg}ms</span>
            {' · '}target {latencyTarget}ms
          </>
        ),
      visual: (
        <VitalBody
          figure={
            <BentoFigure
              value={windowStats.p50 == null ? '—' : <Counter value={windowStats.p50} suffix="ms" {...odometer} />}
              muted={windowStats.p50 == null}
              note={
                windowStats.p95 != null ? (
                  <span style={{ color: windowStats.p95 > latencyTarget ? STATUS.warn : undefined }}>
                    p95 {windowStats.p95}ms
                  </span>
                ) : undefined
              }
            />
          }
          caption={[
            <span key="l">p50 / p95</span>,
            <span key="b">{hours <= 1 ? 'per 5 min' : 'per hour'}</span>,
          ]}
        >
          <BentoBand p50={latencyTrend?.p50 ?? []} p95={latencyTrend?.p95 ?? []} target={latencyTarget} />
        </VitalBody>
      ),
    },
    {
      id: 'budget',
      title: (
        <HowCalculated
          label="Error budget"
          topic="the error budget"
          empty={!budget ? 'No incident data yet' : false}
          rows={
            budget
              ? [
                  { label: 'SLO', value: `${budget.min_uptime_pct}% over ${INCIDENT_WINDOW_DAYS} d` },
                  { label: 'Allowed', value: `${formatDowntime(budget.allowed_downtime_sec)} · ${budgetShare}%` },
                  { label: 'Used', value: formatDowntime(budget.consumed_downtime_sec) },
                ]
              : []
          }
          result={
            budget &&
            (budget.ok
              ? `left = allowed − used = ${formatDowntime(budget.remaining_sec)}`
              : `over by ${formatDowntime(-budget.remaining_sec)}`)
          }
          caveat={`Used is incident downtime, and an incident takes ${project?.failure_threshold ?? PROJECT_DEFAULTS.failure_threshold} failed checks in a row.`}
        />
      ),
      description: `${INCIDENT_WINDOW_DAYS}-day window · SLO ${budget?.min_uptime_pct ?? project?.thresholds?.min_uptime_pct ?? PROJECT_DEFAULTS.min_uptime_pct}%`,
      visual: (
        <VitalBody
          figure={
            <BentoFigure
              value={
                budgetLeft == null ? (
                  '—'
                ) : budget?.ok ? (
                  <Counter value={budgetLeft} suffix="%" {...odometer} />
                ) : (
                  <span style={{ color: STATUS.crit }}>Spent</span>
                )
              }
              muted={budgetLeft == null}
              note={
                budget
                  ? budget.ok
                    ? `${formatDowntime(budget.remaining_sec)} left`
                    : `${formatDowntime(-budget.remaining_sec)} over`
                  : undefined
              }
            />
          }
          caption={[
            <span key="u">{budget ? `${formatDowntime(budget.consumed_downtime_sec)} used` : '—'}</span>,
            <span key="a">{budget ? `${formatDowntime(budget.allowed_downtime_sec)} allowed` : ''}</span>,
          ]}
        >
          <BentoGauge remaining={budgetLeft} color={budgetColor} />
        </VitalBody>
      ),
    },
  ]

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
            {/* Icon only, no chrome. The label stays for screen readers and as a
                tooltip — colour and icon alone are not an accessible state. */}
            {project && (
              <span title={VERDICT[verdict].label} className="inline-grid place-items-center">
                {/* Stale and off are about the monitor, not the site: a still icon, no alarm. */}
                {verdict === 'stale' ? (
                  <ClockAlert size={22} strokeWidth={1.75} color={VERDICT.stale.color} aria-hidden="true" />
                ) : verdict === 'off' ? (
                  <CircleOff size={22} strokeWidth={1.75} color={VERDICT.off.color} aria-hidden="true" />
                ) : (
                  <UseAnimations
                    key={verdict}
                    animation={isUp ? checkCircle : isDownState ? alertOctagon : alertTriangle}
                    size={22}
                    strokeColor={VERDICT[verdict].color}
                    autoplay={!REDUCED_MOTION}
                    loop={isDownState}
                    interaction={isDownState ? 'loop' : 'click-replay'}
                    speed={isDownState ? 1 : 1.4}
                  />
                )}
                <span className="sr-only">{VERDICT[verdict].label}</span>
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
          <div className="flex flex-wrap items-center gap-2">
            <RubberSegment
              items={['1h', '24h', '72h']}
              value={`${hours}h`}
              onChange={(next) => setHours(Number(next.replace('h', '')))}
              size="sm"
              radius={9}
              inset={2}
              trackColor="rgba(255,255,255,0.05)"
              thumbColor="#eceef0"
              textColor="#9aa2ab"
              activeTextColor="#0e1115"
              aria-label="Time window for the chart, heatmap and vitals"
            />
            <ActionButton
              variant="secondary"
              icon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />}
              onAction={loadData}
              labels={{ loading: 'Refreshing…', success: 'Updated', error: 'Failed' }}
            >
              Refresh
            </ActionButton>
            <ActionButton
              variant="secondary"
              icon={<SquarePen className="h-3.5 w-3.5" strokeWidth={2} />}
              onAction={() => setShowEdit(true)}
            >
              Edit
            </ActionButton>
          </div>
        )}
      </div>

      {/* Vitals — four instruments for the selected window */}
      <MagicBento
        items={vitals}
        columns={4}
        rowHeight={204}
        gap={10}
        radius={18}
        minCell={244}
        pairRatio={1.2}
        spotlightRadius={280}
        className="mt-5 animate-fade-up"
      />

      {/* Latency chart, full width under the instruments */}
      <div className="panel-flush mt-3 animate-fade-up" style={{ animationDelay: '120ms' }}>
        <div className="panel-head">
          <span className="text-[13px] font-semibold text-txt-hi">Latency</span>
          <span className="text-[11.5px] text-txt-lo">per check · {hours}h</span>
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

      {/* Daily history: one bar per UTC day, from the monitor's per-day tallies */}
      {status?.daily && (
        <div className="panel-flush mt-3">
          <div className="panel-head">
            <div className="flex items-center gap-2.5">
              <span className="text-[13px] font-semibold text-txt-hi">Daily</span>
              <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[11px] font-medium text-txt-mid">
                {status.daily.days.length}d
              </span>
            </div>
            <span className="text-[11.5px] text-txt-lo">UTC days · an incident marks the day as an outage</span>
          </div>
          <div className="px-4 pb-4 pt-3">
            <DayStrip daily={status.daily} createdAt={project?.created_at} now={now} interactive size="h-7 gap-[3px]" />
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-txt-lo">
              {DAY_LEGEND.map(([label, swatch]) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-[1px] ${swatch}`} />
                  {label}
                </span>
              ))}
              <span className="ml-auto font-mono text-[10.5px]">
                {status.daily.since ? `tracked since ${fmtUtcDay(status.daily.since)}` : 'not tracked yet'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Hourly heatmap: uptime or latency, a column per UTC hour of the day */}
      <div className="panel-flush mt-3">
        {/* Wraps on phones rather than squeezing the metric switch. */}
        <div className="panel-head flex-wrap gap-y-1.5">
          <div className="flex flex-none items-center gap-2.5">
            <RubberSegment
              items={['Uptime', 'Latency']}
              value={heatMetric}
              onChange={setHeatMetric}
              size="sm"
              radius={9}
              inset={2}
              trackColor="rgba(255,255,255,0.05)"
              thumbColor="#eceef0"
              textColor="#9aa2ab"
              activeTextColor="#0e1115"
              aria-label="Heatmap metric"
            />
            <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[11px] font-medium text-txt-mid">
              {hours}h
            </span>
          </div>
          <span className="text-[11.5px] text-txt-lo">
            {hours <= 1 ? '5-minute buckets' : 'UTC hours'} ·{' '}
            {heatMetric === 'Uptime' ? 'conclusive checks only' : 'p50 of successful checks'}
          </span>
        </div>
        <div className="px-4 pb-4 pt-3">
          <HourHeatmap
            buckets={windowBuckets}
            metric={heatMetric === 'Uptime' ? 'uptime' : 'latency'}
            from={now - hours * 3_600_000}
            now={now}
            target={latencyTarget}
            fine={hours <= 1}
          />
        </div>
      </div>

      {/* Where the endpoint is in the incident lifecycle, cross-checked against the record */}
      {project && status && (
        <IncidentState
          checks={checks}
          threshold={project.failure_threshold ?? PROJECT_DEFAULTS.failure_threshold}
          incidents={incidents}
          active={project.active}
          verdict={verdict}
          now={now}
          className="mt-3 animate-fade-up"
        />
      )}

      <IncidentReport
        incidents={incidents}
        reliability={reliability}
        windowDays={reportDays}
        onWindowChange={setReportDays}
        comparisonAvailable={reportDays * 2 <= INCIDENT_WINDOW_DAYS}
      />

      {/* Streak + incident log, side by side once there is room for both */}
      <div className="mt-3 grid items-stretch gap-3 lg:grid-cols-2">
        <FlipClock
          since={incidentFreeSince}
          open={Boolean(reliability?.open_incident)}
          label="No recorded incidents in"
          className="flex h-full flex-col justify-center"
        />
        <div className="min-w-0">
          <IncidentTimeline incidents={incidents} />
        </div>
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
            <span className="text-[12px] text-txt-lo">Period</span>
            <RubberSegment
              items={['1d', '7d', '30d']}
              value={`${genDays}d`}
              onChange={(next) => setGenDays(Number(next.replace('d', '')) as 1 | 7 | 30)}
              disabled={generating}
              size="sm"
              radius={9}
              inset={2}
              trackColor="rgba(255,255,255,0.05)"
              thumbColor="#eceef0"
              textColor="#9aa2ab"
              activeTextColor="#0e1115"
              aria-label="Report period"
            />
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="btn-accent"
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
                        {/* The report's own three-way verdict; rows from before slo_status fall back to sla_pass. */}
                        {(() => {
                          const verdict = r.slo_status ?? (r.sla_pass ? 'met' : 'missed')
                          const tone = verdict === 'met' ? 'text-ok' : verdict === 'missed' ? 'text-crit' : 'text-txt-mid'
                          return (
                            <span className={`font-mono text-[11px] font-bold ${tone}`}>
                              {verdict === 'unproven' ? 'NOT PROVEN' : verdict.toUpperCase()}
                            </span>
                          )
                        })()}
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
      {/* Danger zone — separated from everything above on purpose */}
      <div className="mt-8 rounded-[16px] border border-crit/20 bg-crit/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-txt-hi">Delete this endpoint</p>
            <p className="mt-0.5 max-w-[46ch] text-[12px] leading-relaxed text-txt-lo">
              Stops every check for {project?.name ?? 'this endpoint'} and removes it from the dashboard.
              Its checks, incidents and reports go with it.
            </p>
          </div>
          <HoldButton
            doneLabel="Deleted"
            backgroundColor="#27272a"
            fillColor="#f85149"
            textColor="#f5f5f5"
            fillTextColor="#ffffff"
            size="md"
            radius={12}
            fillDirection="right"
            holdTime={2000}
            releaseTime={200}
            pressScale={0.97}
            wave
            waveAmplitude={6}
            glow
            resetAfter={1200}
            disabled={deleting}
            onHold={handleDelete}
            className="font-pixel"
          >
            Hold to delete
          </HoldButton>
        </div>
        {deleteError && (
          <Alert tone="error" className="mt-3">
            {deleteError}
          </Alert>
        )}
      </div>
    </Shell>
  )
}

import type { Check, DailyTally, Incident } from '../types'

/** Status palette — the single source for status hexes used in inline SVG/styles.
 *  Mirrors the `ok`/`warn`/`crit`/`accent` tokens in tailwind.config.js. */
export const STATUS = {
  ok: '#34d399',
  warn: '#fbbf24',
  crit: '#f87171',
  accent: '#fa5c29',
  /** "No evidence" — a third tone that is neither health nor failure. */
  neutral: '#a1a1aa',
} as const

/** How often live views re-poll the API (matches the 1-minute check cadence). */
export const POLL_INTERVAL_MS = 60_000

/** The monitor Lambda's cadence and HTTP timeout (EventBridge rate(1 minute), HTTP_TIMEOUT_SECONDS). */
const CHECK_INTERVAL_MS = 60_000
const CHECK_TIMEOUT_MS = 10_000
/** No check for this long means the monitor stopped producing evidence: one
 *  missed cycle is tolerated, two are not. */
export const STALE_AFTER_MS = Math.max(2 * CHECK_INTERVAL_MS, CHECK_INTERVAL_MS + CHECK_TIMEOUT_MS + 60_000)

/** Endpoints one account can monitor at once (project_manager MAX_ACTIVE_PROJECTS); deleted ones don't count. */
export const MAX_ACTIVE_PROJECTS = 10

/** Defaults applied by the backend when a project omits them. */
export const PROJECT_DEFAULTS = {
  failure_threshold: 3,
  min_uptime_pct: 99.9,
  max_avg_latency_ms: 300,
} as const

/** Epoch ms → "HH:MM:SS UTC". All SLA windows are UTC; display follows. */
export function fmtUtcTime(tsMs: number): string {
  return new Date(tsMs).toISOString().slice(11, 19) + ' UTC'
}

/** "YYYY-MM-DD" (a UTC day) → "Tue 25 Nov". */
export function fmtUtcDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

/** Compact "time since" label, e.g. now / 4m / 2h / 3d. */
export function timeAgo(ts: string | number | undefined): string {
  if (ts === undefined || ts === null) return '—'
  const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts
  if (Number.isNaN(ms)) return '—'
  const diff = Date.now() - ms
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/** Uptime % over conclusive checks only. Inconclusive checks are excluded from
 *  both the numerator and the denominator, so a blocked probe can neither add
 *  uptime nor take it away. Returns null when no check produced a verdict —
 *  "no evidence" is not "0%". */
export function uptimeFromChecks(checks: Check[]): number | null {
  if (!checks || checks.length === 0) return null
  const up = checks.filter((c) => c.status === 'success').length
  const down = checks.filter((c) => c.status === 'failure').length
  if (up + down === 0) return null
  return (up / (up + down)) * 100
}

/** Share of observed checks that produced a verdict (0–100), or null if there
 *  are no checks. Distinct from the API's coverage_pct, which is measured
 *  against the checks the schedule should have produced. */
export function evidenceFromChecks(checks: Check[]): number | null {
  if (!checks || checks.length === 0) return null
  const conclusive = checks.filter((c) => c.status === 'success' || c.status === 'failure').length
  return (conclusive / checks.length) * 100
}

/** The three check verdicts, plus what a monitor is when it has no current one. */
export type Verdict = 'up' | 'down' | 'inconclusive' | 'stale' | 'off' | 'pending'

function verdictFromStatus(status: string | undefined): Verdict {
  if (status === 'success') return 'up'
  if (status === 'failure') return 'down'
  if (status === 'inconclusive') return 'inconclusive'
  return 'pending'
}

/**
 * A monitor's verdict right now, in precedence order. An inactive monitor is
 * off, unless it left an incident open. A monitor with no check yet is pending,
 * or stale once its first check was due. A last check too old to trust is
 * stale. Only then does the latest check speak, so missing evidence never
 * reads as up.
 */
export function verdictFor(
  monitor: {
    active?: boolean
    created_at?: string
    current_status?: string
    last_checked_at?: number | null
    open_incident?: boolean
  },
  now: number,
): Verdict {
  if (monitor.active === false) return monitor.open_incident ? 'down' : 'off'
  if (monitor.last_checked_at == null) {
    // An unparseable created_at gives NaN, which compares false: it stays pending.
    const created = new Date(monitor.created_at ?? '').getTime()
    return now - created > STALE_AFTER_MS ? 'stale' : 'pending'
  }
  return now - monitor.last_checked_at > STALE_AFTER_MS ? 'stale' : verdictFromStatus(monitor.current_status)
}

/** Below this share of the expected checks an SLO is unproven, not met or missed (report generator: SLO_MIN_COVERAGE_PCT). */
export const SLO_MIN_COVERAGE = 95

const round2 = (v: number) => Math.round(v * 100) / 100

/** The report generator's availability (compute_availability_metrics), from counts: uptime over
 *  conclusive checks only (null without any), coverage over the checks the schedule expected. */
export function availability(up: number, down: number, expected: number) {
  const conclusive = up + down
  return {
    uptime: conclusive ? round2((up / conclusive) * 100) : null,
    coverage: round2((conclusive / Math.max(expected, conclusive, 1)) * 100),
  }
}

/** The report generator's verdict (evaluate_sla): severity follows uptime, and too little evidence is unproven. */
export function sloResult(target: { min_uptime_pct: number; max_avg_latency_ms: number }, uptime: number, avgLatency: number, coverage: number) {
  const sla_pass = uptime >= target.min_uptime_pct && avgLatency <= target.max_avg_latency_ms
  const severity = sla_pass ? 'healthy' : uptime >= 99 ? 'degraded' : uptime >= 95 ? 'major' : 'critical'
  const slo_status = coverage < SLO_MIN_COVERAGE ? 'unproven' : sla_pass ? 'met' : 'missed'
  return { sla_pass, severity, slo_status } as const
}

/** Verdict display metadata. `textClass` for Tailwind text, `color` for inline SVG. */
export const VERDICT = {
  up: { label: 'Operational', short: 'UP', textClass: 'text-ok', color: STATUS.ok },
  down: { label: 'Down', short: 'DOWN', textClass: 'text-crit', color: STATUS.crit },
  inconclusive: {
    label: 'No evidence',
    short: 'NO DATA',
    textClass: 'text-txt-lo',
    color: STATUS.neutral,
  },
  /** Checks stopped arriving: the last verdict can no longer be trusted. */
  stale: { label: 'Stale', short: 'STALE', textClass: 'text-warn', color: STATUS.warn },
  /** Inactive (paused or deleted): nothing is checking it. */
  off: { label: 'Not monitored', short: 'OFF', textClass: 'text-txt-lo', color: STATUS.neutral },
  pending: { label: 'Pending first check', short: '—', textClass: 'text-txt-lo', color: STATUS.neutral },
} as const

export type DayVerdict = 'operational' | 'outage' | 'no_data' | 'untracked'

/**
 * A UTC day's verdict. Any confirmed outage makes it an outage. A day before
 * tracking began (or before the monitor existed) is untracked, which is not the
 * same claim as "no data". Otherwise it takes conclusive checks to count as
 * operational. `thin` marks a full past day with under half its expected
 * checks, so it does not look as solid as a covered one; today, the creation
 * day and the first tracked day are partial by nature and never thin.
 */
export function dayVerdict(day: DailyTally, since: string | null, createdAt: string | undefined, now: number) {
  const start = Date.parse(`${day.date}T00:00:00Z`)
  const end = start + 86_400_000
  const created = createdAt ? Date.parse(createdAt) : NaN
  const born = Number.isNaN(created) ? start : Math.max(start, created)
  const conclusive = day.up + day.down
  // A monitor older than its tally began counting mid-day, at a time we do not
  // know, so that first day has no honest denominator.
  const expected = day.date === since && born === start ? null : Math.max(1, Math.floor((Math.min(end, now) - born) / CHECK_INTERVAL_MS))
  const partial = now < end || born > start || day.date === since
  const verdict: DayVerdict =
    day.outage_sec > 0
      ? 'outage'
      : since == null || day.date < since || created >= end
        ? 'untracked'
        : conclusive === 0
          ? 'no_data'
          : 'operational'
  return {
    verdict,
    expected,
    uptime: conclusive > 0 ? (day.up / conclusive) * 100 : null,
    partial,
    thin: verdict === 'operational' && !partial && expected != null && conclusive / expected < 0.5,
  }
}

export const DAY_VERDICT = {
  operational: { label: 'Operational', color: STATUS.ok },
  outage: { label: 'Outage', color: STATUS.crit },
  no_data: { label: 'No data', color: STATUS.neutral },
  untracked: { label: 'Not tracked', color: STATUS.neutral },
} as const

const HOUR_MS = 3_600_000

/** One cell of the day × hour heatmap: its UTC hour, the window bucket for it
 *  (null when no check landed), and whether the hour overlaps the window. */
export interface HourCell<T> {
  start: number
  bucket: T | null
  inWindow: boolean
}

/** One row of 24 UTC hours per UTC date the window [from, now] touches, oldest
 *  first, so a column always means the same hour of the day. */
export function hourGrid<T extends { key: string }>(buckets: T[], from: number, now: number) {
  const byStart = new Map(buckets.map((bucket) => [Number(bucket.key), bucket]))
  const rows: { date: string; cells: HourCell<T>[] }[] = []
  for (let day = Math.floor(from / 86_400_000) * 86_400_000; day <= now; day += 86_400_000) {
    const cells = Array.from({ length: 24 }, (_, hour) => {
      const start = day + hour * HOUR_MS
      return { start, bucket: byStart.get(start) ?? null, inWindow: start < now && start + HOUR_MS > from }
    })
    rows.push({ date: new Date(day).toISOString().slice(0, 10), cells })
  }
  return rows
}

/** Latency ramp relative to the average-latency target. No red: slow is not down. */
export const LATENCY_LEVELS = [
  { upTo: 0.5, color: '#2f9e6b' },
  { upTo: 1, color: '#34d399' },
  { upTo: 1.5, color: '#fbbf24' },
  { upTo: Infinity, color: '#f97316' },
] as const

export function latencyColor(ms: number, target: number): string {
  return (LATENCY_LEVELS.find((level) => ms <= level.upTo * target) ?? LATENCY_LEVELS[3]).color
}

/** Severity → display metadata (label + tailwind-friendly hex). */
export const SEVERITY = {
  healthy: { label: 'HEALTHY', color: STATUS.ok, dim: 'rgba(52,211,153,0.14)' },
  degraded: { label: 'DEGRADED', color: STATUS.warn, dim: 'rgba(251,191,36,0.14)' },
  major: { label: 'MAJOR', color: '#fb923c', dim: 'rgba(251,146,60,0.14)' },
  critical: { label: 'CRITICAL', color: STATUS.crit, dim: 'rgba(248,113,113,0.14)' },
} as const

export type Severity = keyof typeof SEVERITY

/** Strip protocol for compact display. */
export function bareUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

/** Clamp helper. */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** Seconds → compact "1h 2m" / "3m 4s" / "5s". Shared by the reports table and
 *  the incident timeline. Negative inputs are clamped to 0. */
export function formatDowntime(sec: number): string {
  const total = Math.max(0, Math.round(sec))
  if (!total) return '0s'
  if (total < 60) return `${total}s`
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

/** Failure-cause → display metadata. Colors reuse the status/severity hues. */
export const ERROR_TYPE = {
  timeout: { label: 'TIMEOUT', color: STATUS.warn },
  dns: { label: 'DNS', color: STATUS.accent },
  conn: { label: 'CONN', color: STATUS.crit },
  tls: { label: 'TLS', color: SEVERITY.major.color },
  http: { label: 'HTTP', color: STATUS.warn },
  blocked: { label: 'BLOCKED', color: STATUS.neutral },
  // The monitor refused to connect: the address isn't public (it says nothing about the site).
  private: { label: 'PRIVATE', color: STATUS.neutral },
} as const

/** An open incident has no end_time yet; it runs up to now. */
export const incidentEnd = (incident: Incident, nowSec: number) => incident.end_time ?? (incident.resolved ? incident.start_time : nowSec)

/** Incident totals for a window, using the incident list we already fetched.
 *  An incident can begin before the window; only its part inside it counts, so
 *  one that spans two windows counts once in each, with its downtime split. */
export function incidentTotals(incidents: Incident[], fromSec: number, toSec: number, nowSec: number) {
  const inWindow = incidents.filter((i) => i.start_time < toSec && incidentEnd(i, nowSec) > fromSec)
  let downtime = 0
  let resolvedDuration = 0
  let resolvedCount = 0
  let longest = 0
  for (const incident of inWindow) {
    const seconds = Math.min(incidentEnd(incident, nowSec), toSec) - Math.max(incident.start_time, fromSec)
    downtime += seconds
    longest = Math.max(longest, seconds)
    // Cut off when monitoring stopped, not repaired: downtime, but no recovery time.
    if (incident.resolved && incident.duration_seconds != null && !incident.closed_reason) {
      resolvedDuration += incident.duration_seconds
      resolvedCount += 1
    }
  }
  // MTBF is computed per window rather than taken from the API metrics, which
  // are calculated over the whole fetched range — otherwise the card would mix
  // a 7-day headline with a 30-day average. Only failures that began inside it.
  const starts = inWindow
    .map((incident) => incident.start_time)
    .filter((start) => start >= fromSec)
    .sort((a, b) => a - b)
  let mtbf: number | null = null
  if (starts.length >= 2) {
    let total = 0
    for (let i = 1; i < starts.length; i++) total += starts[i] - starts[i - 1]
    mtbf = total / (starts.length - 1)
  }

  return {
    count: inWindow.length,
    downtime,
    longest,
    mtbf,
    mttr: resolvedCount > 0 ? resolvedDuration / resolvedCount : null,
  }
}

/** The SLA processor writes the incident record at the top of every hour (EventBridge cron(0 * * * ? *)). */
export const nextPass = (ms: number) => (Math.floor(ms / HOUR_MS) + 1) * HOUR_MS
/** How long after its pass a record that still disagrees with the checks reads as overdue. */
const PASS_GRACE_MS = 10 * 60_000

export type IncidentStage = 'healthy' | 'suspect' | 'open' | 'recovering'

/** What the incidents table says, cross-checked against the checks. */
export type IncidentRecord =
  | { kind: 'none' }
  /** An open incident that covers the outage in the checks. */
  | { kind: 'open'; since: number }
  /** Still open, though a check has passed since: the pass at `pass` closes it. */
  | { kind: 'closing'; since: number; pass: number; overdue: boolean }
  /** An outage of N failures the record does not have yet: the pass at `pass` records it. */
  | { kind: 'missing'; pass: number; overdue: boolean }
  /** Open on an endpoint that is no longer monitored: the next pass closes it as monitoring stopped. */
  | { kind: 'stopping'; since: number; pass: number }

export interface IncidentState {
  /** The lit state, or null when none can honestly be lit (see `blank`). */
  stage: IncidentStage | null
  blank?: 'off' | 'pending' | 'no_evidence' | 'no_checks'
  /** Failed checks in a row, ending at the latest check. */
  streak: number
  /** When the latest check is inconclusive: the failures in a row it reset. */
  reset: number
  /** Epoch ms: when the outage (open), the failing streak (suspect) or the recovery (recovering) began. */
  since: number | null
  /** `since` is the first check of the hour read, so the real time may be earlier. */
  cut: boolean
  /** Recovering: seconds from the outage's start to the passing check, when both are known. */
  downFor: number | null
  record: IncidentRecord
}

/**
 * Where an endpoint is in the incident lifecycle, by the backend's own rules:
 * N failed checks in a row (any success or inconclusive check ends the run)
 * open an incident, the first passing check ends it, and only the hourly pass
 * writes either to the record. Reads the last hour of checks only, which every
 * page window holds, so switching the window never changes the answer.
 */
export function incidentState({
  checks,
  threshold,
  incidents,
  active,
  verdict,
  now,
}: {
  /** Oldest first. */
  checks: Check[]
  threshold: number
  incidents: Incident[]
  active: boolean
  verdict: Verdict
  now: number
}): IncidentState {
  const n = Math.max(1, threshold)
  const recent = checks.filter((c) => c.timestamp > now - HOUR_MS)
  const row = incidents.find((i) => !i.resolved)
  const rowStart = row ? row.start_time * 1000 : null
  const passedAfter = (ms: number) => recent.find((c) => c.status === 'success' && c.timestamp > ms)?.timestamp ?? null

  // The newest run of N or more failures, as the processor finds them.
  let run: { start: number; reached: number; end: number } | null = null
  for (let i = 0, first = -1; i < recent.length; i++) {
    if (recent[i].status !== 'failure') first = -1
    else {
      if (first < 0) first = i
      if (i - first + 1 >= n) run = { start: recent[first].timestamp, reached: recent[first + n - 1].timestamp, end: recent[i].timestamp }
    }
  }

  let last = recent.length - 1
  let streak = 0
  for (let i = last; i >= 0 && recent[i].status === 'failure'; i--) streak++
  while (last >= 0 && recent[last].status === 'inconclusive') last--
  let reset = 0
  for (let i = last; i >= 0 && recent[i].status === 'failure'; i--) reset++

  const runOver = run ? passedAfter(run.end) : null
  const rowOver = rowStart != null ? passedAfter(rowStart) : null
  // An open row ends at the first check that passed after it began: that is where the pass closes it.
  const covered =
    run != null &&
    incidents.some((inc) => {
      const end = inc.resolved ? (inc.end_time ?? inc.start_time) * 1000 : inc === row && rowOver != null ? rowOver : Infinity
      return inc.start_time * 1000 <= run.end && end >= run.start
    })

  // A paused endpoint's pass still runs the normal rules first, so only an
  // outage nothing has ended yet closes as monitoring stopped.
  let record: IncidentRecord
  if (row && rowOver == null) record = active ? { kind: 'open', since: rowStart! } : { kind: 'stopping', since: rowStart!, pass: nextPass(now) }
  else if (run && !covered) record = { kind: 'missing', pass: nextPass(run.reached), overdue: now > nextPass(run.reached) + PASS_GRACE_MS }
  else if (row) record = { kind: 'closing', since: rowStart!, pass: nextPass(rowOver!), overdue: now > nextPass(rowOver!) + PASS_GRACE_MS }
  else record = { kind: 'none' }

  const ongoing = streak >= n || (run != null && runOver == null) || (rowStart != null && rowOver == null)
  const latest = recent[recent.length - 1]
  const outageStart = record.kind === 'closing' ? record.since : run?.start ?? null
  const backUp = record.kind === 'closing' ? rowOver : record.kind === 'missing' ? runOver : null
  // A time read off the first check of the hour may be later than the truth: the checks before it are not read.
  const cut = (ms: number | null) => ms != null && ms === recent[0]?.timestamp
  const base = { streak, reset, record, since: null, cut: false, downFor: null }

  if (!active) return { ...base, stage: null, blank: 'off' }
  if (verdict === 'pending') return { ...base, stage: null, blank: 'pending' }
  if (ongoing) {
    const since = record.kind === 'open' ? record.since : run?.start ?? null
    return { ...base, stage: 'open', since, cut: record.kind !== 'open' && cut(since) }
  }
  if (!latest) return { ...base, stage: null, blank: 'no_checks' }
  if (latest.status === 'failure') return { ...base, stage: 'suspect', since: recent[recent.length - streak].timestamp }
  // Recovering only while nothing has failed since the check that passed.
  if (backUp != null && outageStart != null && reset === 0) {
    const unknown = cut(backUp) || (record.kind === 'missing' && cut(outageStart))
    // Whole seconds, as the record stores both ends, so it matches the incident log once closed.
    const downFor = unknown ? null : Math.floor(backUp / 1000) - Math.floor(outageStart / 1000)
    return { ...base, stage: 'recovering', since: backUp, cut: cut(backUp), downFor }
  }
  if (latest.status === 'inconclusive') return { ...base, stage: null, blank: 'no_evidence' }
  return { ...base, stage: 'healthy' }
}

/**
 * Demo dataset (board #11): hand-written stories for seven fictional endpoints,
 * read relative to "now" so the app's freshness rules see them as live. The
 * checks, day tallies, incidents and reports are all derived from the stories
 * by the backend's own rules (N failures in a row open an incident, the first
 * passing check closes it, the hourly pass writes the record), so every view
 * agrees with every other. Pure: no network, no storage, no randomness; the
 * latency noise is a hash of the minute, so a refresh shows the same numbers.
 *
 * The stories hang off the hour the visitor arrived in (`anchor`), not the
 * current hour, so within a visit the demo moves the way the real system would:
 * an open incident stays open, and a recovered one closes at the next hourly
 * pass. A reload starts the stories again from the new hour.
 *
 * Imports stay type-only or `.ts` paths, so `node --test` can load this file (type stripping).
 */
import { sloResult } from '../lib/format.ts'
import type {
  Check,
  Daily,
  DailyTally,
  ErrorType,
  Incident,
  IncidentsResponse,
  Project,
  ProjectReport,
  ProjectStatus,
  ReliabilityMetrics,
  StatusSummary,
} from '../types'

const MIN = 60_000
const HOUR = 3_600_000
const DAY_MIN = 1440

// ─── The stories ────────────────────────────────────────────────────────────

/**
 * A stretch of checks that did not pass, or of checks that never ran (gap).
 * `at` anchors `from` (in minutes): 'hour' is the top of the current hour, a
 * number is that many UTC midnights ago, and 'latest' means the last `minutes`
 * checks, whenever now is.
 */
interface Stretch {
  at: 'hour' | 'latest' | number
  from: number
  /** Infinity runs on to now. */
  minutes: number
  status: 'failure' | 'inconclusive' | 'gap'
  http?: number
  error?: ErrorType
}

interface Story {
  id: string
  name: string
  url: string
  createdDaysAgo: number
  threshold: number
  target: { min_uptime_pct: number; max_avg_latency_ms: number }
  accepted?: string
  /** Base latency and the spread above it, in ms. */
  latency: [number, number]
  cert?: [number, string]
  /** Checks stopped this many minutes before the top of the hour: a stale monitor. */
  stoppedBeforeHour?: number
  stretches: Stretch[]
  /** A visitor's endpoint: created at this instant (ms). */
  createdAtMs?: number
  /** Paused or deleted by the visitor at this instant (ms): no checks after it. */
  pausedAtMs?: number
  email?: string
}

const conn = { status: 'failure', http: 0, error: 'conn' } as const
const timeout = { status: 'failure', http: 0, error: 'timeout' } as const
const http503 = { status: 'failure', http: 503, error: 'http' } as const

export const STORIES: Story[] = [
  {
    // Operational for a month, apart from one hour the monitor itself missed.
    id: 'storefront',
    name: 'Storefront',
    url: 'https://shop.example.com',
    createdDaysAgo: 120,
    threshold: 3,
    target: { min_uptime_pct: 99.9, max_avg_latency_ms: 300 },
    latency: [150, 60],
    cert: [64, "Let's Encrypt R11"],
    stretches: [{ at: 16, from: 120, minutes: 60, status: 'gap' }],
  },
  {
    // Operational now, with three resolved incidents and some short blips that
    // lower availability without ever becoming an incident.
    id: 'public-api',
    name: 'Public API',
    url: 'https://api.example.com/health',
    createdDaysAgo: 200,
    threshold: 3,
    target: { min_uptime_pct: 99.95, max_avg_latency_ms: 250 },
    accepted: '200-299',
    latency: [90, 40],
    cert: [28, 'Amazon RSA 2048 M02'],
    stretches: [
      { at: 2, from: 9 * 60 + 30, minutes: 2, ...http503 },
      { at: 4, from: 3 * 60 + 12, minutes: 6, ...timeout },
      { at: 12, from: 14 * 60 + 40, minutes: 41, ...http503 },
      { at: 23, from: 21 * 60 + 5, minutes: 4, ...conn },
    ],
  },
  {
    // Down now: refusing connections for over two hours, on record. A 1h40m
    // outage nine days ago makes an outage day and a failing weekly report.
    id: 'checkout',
    name: 'Checkout',
    url: 'https://checkout.example.com',
    createdDaysAgo: 90,
    threshold: 3,
    target: { min_uptime_pct: 99.9, max_avg_latency_ms: 400 },
    latency: [220, 90],
    cert: [41, 'DigiCert Global G2'],
    stretches: [
      { at: 9, from: 10 * 60 + 5, minutes: 100, ...http503 },
      { at: 'hour', from: -137, minutes: Infinity, ...conn },
    ],
  },
  {
    // Recovering: 503s in the minutes before the hour, which the pass at the top
    // of the hour recorded as open; back up since, until the next pass closes it.
    id: 'auth',
    name: 'Sign-in',
    url: 'https://auth.example.com/login',
    createdDaysAgo: 60,
    threshold: 3,
    target: { min_uptime_pct: 99.9, max_avg_latency_ms: 300 },
    latency: [130, 50],
    cert: [53, "Let's Encrypt R10"],
    stretches: [
      { at: 18, from: 7 * 60 + 30, minutes: 12, ...timeout },
      { at: 'hour', from: -9, minutes: 9, ...http503 },
    ],
  },
  {
    // Suspect: the last two checks timed out, one short of its threshold.
    id: 'docs',
    name: 'Docs',
    url: 'https://docs.example.com',
    createdDaysAgo: 45,
    threshold: 3,
    target: { min_uptime_pct: 99.5, max_avg_latency_ms: 500 },
    latency: [110, 40],
    cert: [77, "Let's Encrypt R11"],
    stretches: [{ at: 'latest', from: 0, minutes: 2, ...timeout }],
  },
  {
    // No evidence: a bot challenge has answered every check for five hours.
    id: 'www',
    name: 'Marketing site',
    url: 'https://www.example.com',
    createdDaysAgo: 75,
    threshold: 3,
    target: { min_uptime_pct: 99.5, max_avg_latency_ms: 600 },
    latency: [170, 70],
    cert: [19, 'Cloudflare TLS Issuing ECC CA 3'],
    stretches: [{ at: 'hour', from: -300, minutes: Infinity, status: 'inconclusive', http: 403, error: 'blocked' }],
  },
  {
    // Stale: the monitor stopped reporting on it twelve minutes before the hour.
    id: 'legacy',
    name: 'Legacy portal',
    url: 'https://legacy.example.org',
    createdDaysAgo: 300,
    threshold: 5,
    target: { min_uptime_pct: 99.5, max_avg_latency_ms: 800 },
    latency: [480, 200],
    cert: [9, 'Sectigo RSA DV'],
    stoppedBeforeHour: 12,
    stretches: [],
  },
]

/** The demo visitor's address (lib/demo.ts DEMO_USER); this file keeps type-only imports. */
const DEMO_EMAIL = 'demo@example.com'

// ─── Time ───────────────────────────────────────────────────────────────────

/** The SLA processor's hourly pass: the first top of the hour after `ms`. */
const nextPass = (ms: number) => (Math.floor(ms / HOUR) + 1) * HOUR
const toMinute = (ms: number) => Math.floor(ms / MIN)
const hourStartMin = (now: number) => Math.floor(now / HOUR) * 60
const dayStartMin = (now: number) => toMinute(now) - (toMinute(now) % DAY_MIN)
const isoDay = (minute: number) => new Date(minute * MIN).toISOString().slice(0, 10)

/**
 * A minute's monitor run, as the real one goes: EventBridge starts it at the
 * same second every minute (15 s in here; about 49 s on the live stack), it
 * scans the endpoints, probes them all at once, and writes nothing until the
 * slowest probe is back.
 */
const runStart = (minute: number) => minute * MIN + 15_000 + Math.floor(unit(minute * 3 + 1) * 40)
/** Every row of a run is stored by then, even one held by a 10 s timeout, so whether a
 *  row is visible yet never depends on the other endpoints' probes. */
const STORED_AFTER = 11_000

// ─── One endpoint, resolved against now ─────────────────────────────────────

interface Span {
  start: number
  end: number
  stretch: Stretch
}

interface Resolved {
  story: Story
  /** Its place among all endpoints: spreads the check times and the latency noise. */
  index: number
  /** First and last minute with a check (inclusive). */
  first: number
  last: number
  spans: Span[]
}

// ─── A visit's changes: in memory only, gone on reload ──────────────────────

/** Endpoints the visitor added, and the visitor's edits to any endpoint. */
const added: Story[] = []
const edits = new Map<string, Partial<Story>>()
const allIds = () => [...STORIES, ...added].map((s) => s.id)

function story(id: string): Story {
  const found = STORIES.find((s) => s.id === id) ?? added.find((s) => s.id === id)
  if (!found) throw new Error(`No demo endpoint "${id}"`)
  const edit = edits.get(id)
  return edit ? { ...found, ...edit } : found
}

export function createdAt(s: Story, now: number): string {
  if (s.createdAtMs != null) return new Date(s.createdAtMs).toISOString()
  // 09:30 UTC on the creation day, so the first day is a partial one.
  return new Date((dayStartMin(now) - s.createdDaysAgo * DAY_MIN + 9 * 60 + 30) * MIN).toISOString()
}

function resolve(s: Story, now: number, anchor: number): Resolved {
  const r = { story: s, index: allIds().indexOf(s.id), first: 0, last: 0, spans: [] as Span[] }
  const created = Date.parse(createdAt(s, anchor))
  r.first = toMinute(created)
  if (runStart(r.first) < created) r.first += 1 // a run only probes the endpoints that existed when it started
  r.last = toMinute(now)
  if (runStart(r.last) + STORED_AFTER > now) r.last -= 1 // this minute's run has not stored its rows yet
  if (s.stoppedBeforeHour != null) r.last = Math.min(r.last, hourStartMin(anchor) - s.stoppedBeforeHour)
  if (s.pausedAtMs != null) {
    let paused = toMinute(s.pausedAtMs)
    if (runStart(paused) > s.pausedAtMs) paused -= 1
    r.last = Math.min(r.last, paused)
  }
  r.spans = s.stretches.map((stretch) => {
    if (stretch.at === 'latest') return { start: r.last - stretch.minutes + 1, end: r.last + 1, stretch }
    // Both anchors are the visit's, so history holds still across midnight too.
    const base = stretch.at === 'hour' ? hourStartMin(anchor) : dayStartMin(anchor) - stretch.at * DAY_MIN
    const start = base + stretch.from
    return { start, end: stretch.minutes === Infinity ? Infinity : start + stretch.minutes, stretch }
  })
  return r
}

/** One endpoint's probe in a minute's run, or null when none ran (before creation, after it stopped, in a gap). */
function probeAt(r: Resolved, minute: number) {
  if (minute < r.first || minute > r.last) return null
  const span = r.spans.find((x) => minute >= x.start && minute < x.end)
  if (span?.stretch.status === 'gap') return null
  const stretch = span?.stretch
  const index = r.index
  const [base, spread] = r.story.latency
  // A hash of the minute, so the same minute always has the same latency.
  const noise = unit(minute * 31 + index)
  // An occasional slow answer, not a wall of spikes.
  const spike = unit(minute * 17 + index * 7) < 0.015 ? 120 + Math.round(200 * unit(minute + index * 13)) : 0
  // Busiest mid-afternoon UTC, and each day a little faster or slower than the last.
  const rhythm = 0.25 * spread * Math.sin(2 * Math.PI * ((minute % DAY_MIN) / DAY_MIN - 0.375))
  const drift = 0.92 + 0.16 * unit(Math.floor(minute / DAY_MIN) * 13 + index)
  const answered = !stretch || stretch.error === 'http' || stretch.error === 'blocked'
  const latency = Math.round((base + spread * noise) * drift + rhythm + spike)
  // The scan takes the run's first 18-30 ms; then every probe starts at once (fewer endpoints than the 8 workers).
  const start = runStart(minute) + 18 + Math.floor(unit(minute * 13 + 7) * 12) + Math.floor(unit(minute * 5 + index) * 2)
  // An unanswered probe stores the 10 s placeholder, but only a timeout really takes that long.
  const took = answered ? latency : stretch?.error === 'timeout' ? 10_000 + Math.floor(unit(minute * 23 + index) * 25) : 20 + Math.floor(unit(minute * 29 + index) * 40)
  return { stretch, answered, latency: answered ? latency : 10_000, start, end: start + took }
}

/** When a minute's check landed: its probe's end. */
const checkTime = (r: Resolved, minute: number) => probeAt(r, minute)?.end ?? runStart(minute)

/** The check at a minute, or null when none ran. Its write time needs the whole run: see `withWrite`. */
function checkAt(r: Resolved, minute: number): Check | null {
  const probe = probeAt(r, minute)
  if (!probe) return null
  const { stretch } = probe
  return {
    timestamp: probe.end,
    status: stretch ? (stretch.status as Check['status']) : 'success',
    latency_ms: probe.latency,
    http_status_code: stretch ? stretch.http ?? 0 : 200,
    error_type: stretch?.error ?? null,
    accepted_status: r.story.accepted ?? '200-399',
    run_started_at: runStart(minute),
    probe_started_at: probe.start,
  }
}

/**
 * The moment a check's row went to the table. The monitor writes nothing until
 * the run's slowest probe is back, then one row about every 40 ms (the check
 * and its day tally), in shuffled order, so one timeout holds every row of its run.
 */
function writeAt(fleet: Resolved[], r: Resolved, minute: number): number {
  const probes = fleet.flatMap((x) => {
    const probe = probeAt(x, minute)
    return probe ? [{ x, end: probe.end }] : []
  })
  const done = Math.max(...probes.map((p) => p.end))
  const order = probes.map((p) => p.x).sort((a, b) => unit(minute * 11 + a.index) - unit(minute * 11 + b.index))
  return done + 1 + order.indexOf(r) * 40 + Math.floor(unit(minute * 19 + r.index) * 8)
}

/** mulberry32: a deterministic number in [0, 1) from a seed. */
function unit(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
}

/** Up, down and inconclusive checks in [a, b) minutes, counted without listing them. */
function tally(r: Resolved, a: number, b: number): { up: number; down: number; inconclusive: number } {
  const lo = Math.max(a, r.first)
  const hi = Math.min(b, r.last + 1)
  if (hi <= lo) return { up: 0, down: 0, inconclusive: 0 }
  const overlap = (status: Stretch['status']) =>
    r.spans
      .filter((x) => x.stretch.status === status)
      .reduce((sum, x) => sum + Math.max(0, Math.min(hi, x.end) - Math.max(lo, x.start)), 0)
  const down = overlap('failure')
  const inconclusive = overlap('inconclusive')
  return { up: hi - lo - overlap('gap') - down - inconclusive, down, inconclusive }
}

/** The incident record, as the hourly pass would have written it by now. */
function incidents(r: Resolved, now: number): Incident[] {
  const out: Incident[] = []
  for (const span of r.spans) {
    if (span.stretch.status !== 'failure') continue
    const lo = Math.max(span.start, r.first)
    const hi = Math.min(span.end, r.last + 1)
    if (hi - lo < r.story.threshold) continue
    // Not on record until the pass after the run reached the threshold.
    if (nextPass(checkTime(r, lo + r.story.threshold - 1)) > now) continue
    const start = Math.floor(checkTime(r, lo) / 1000)
    // The first passing check after the run closes it, once the next pass has run.
    let next = hi
    while (next <= r.last && checkAt(r, next)?.status !== 'success') next++
    const recovery = next <= r.last ? checkTime(r, next) : null
    let end = recovery != null && nextPass(recovery) <= now ? Math.floor(recovery / 1000) : null
    // Paused while still down: the pass after the pause closes it at the last check.
    const stopped = end == null && r.story.pausedAtMs != null && nextPass(r.story.pausedAtMs) <= now
    if (stopped) end = Math.floor(checkTime(r, r.last) / 1000)
    out.push({
      project_id: r.story.id,
      start_time: start,
      end_time: end,
      duration_seconds: end == null ? null : end - start,
      resolved: end != null,
      cause: span.stretch.error ?? null,
      ...(stopped ? { closed_reason: 'monitoring_stopped' as const } : {}),
    })
  }
  return out.sort((x, y) => y.start_time - x.start_time) // newest first, like the API
}

/** Seconds of incident time inside [fromSec, toSec]; an open incident runs to toSec. */
function downtimeIn(list: Incident[], fromSec: number, toSec: number): number {
  return list.reduce((sum, i) => {
    const end = i.end_time ?? toSec
    return sum + Math.max(0, Math.min(end, toSec) - Math.max(i.start_time, fromSec))
  }, 0)
}

// ─── API-shaped views ───────────────────────────────────────────────────────

/** Checks in [fromMs, toMs], oldest first. */
export function demoChecks(id: string, fromMs: number, toMs: number, now: number, anchor = now): Check[] {
  // Every endpoint, because a row's write waits for the slowest probe of its run.
  const fleet = allIds().map((x) => resolve(story(x), now, anchor))
  const r = fleet.find((x) => x.story.id === id) as Resolved
  const out: Check[] = []
  for (let m = Math.max(toMinute(fromMs), r.first); m <= Math.min(toMinute(toMs), r.last); m++) {
    const check = checkAt(r, m)
    if (check && check.timestamp >= fromMs && check.timestamp <= toMs) out.push({ ...check, write_started_at: writeAt(fleet, r, m) })
  }
  return out
}

/** The last `days` UTC days, oldest first: the API's `_daily`. */
export function demoDaily(id: string, days: number, now: number, anchor = now): Daily {
  const r = resolve(story(id), now, anchor)
  const list = incidents(r, now)
  const nowSec = Math.floor(now / 1000)
  const firstDay = dayStartMin(now) - (days - 1) * DAY_MIN
  const out: DailyTally[] = []
  for (let day = firstDay; day <= dayStartMin(now); day += DAY_MIN) {
    const { up, down, inconclusive } = tally(r, day, day + DAY_MIN)
    const start = day * 60
    out.push({ date: isoDay(day), up, down, inconclusive, outage_sec: downtimeIn(list, start, Math.min(start + 86_400, nowSec)) })
  }
  return { since: isoDay(r.first), days: out }
}

/** The API's `/status` window, with the 30-day (or list's 14-day) history. */
export function demoStatus(id: string, hours: number, now: number, days = 30, anchor = now): ProjectStatus {
  const checks = demoChecks(id, now - hours * HOUR, now, now, anchor)
  const up = checks.filter((c) => c.status === 'success').length
  const down = checks.filter((c) => c.status === 'failure').length
  const expected = Math.max(hours * 60, 1)
  const summary: StatusSummary = {
    window_hours: hours,
    checks_total: checks.length,
    checks_up: up,
    checks_down: down,
    checks_inconclusive: checks.length - up - down,
    checks_expected: expected,
    uptime_pct: up + down ? Math.round((up / (up + down)) * 10_000) / 100 : null,
    coverage_pct: Math.round(Math.min((up + down) / expected, 1) * 10_000) / 100,
  }
  return {
    project_id: id,
    current_status: checks[checks.length - 1]?.status ?? 'unknown',
    summary,
    checks,
    daily: demoDaily(id, days, now, anchor),
  }
}

/** One project as GET /projects/{id} returns it. */
export function demoProject(id: string, now: number, anchor = now): Project {
  const s = story(id)
  const r = resolve(s, now, anchor)
  const latest = checkAt(r, r.last)
  return {
    project_id: s.id,
    name: s.name,
    url: s.url,
    active: s.pausedAtMs == null,
    failure_threshold: s.threshold,
    thresholds: { ...s.target },
    notification_email: s.email ?? DEMO_EMAIL,
    created_at: createdAt(s, anchor),
    accepted_status: s.accepted ?? '200-399',
    current_status: latest?.status ?? 'unknown',
    last_latency_ms: latest?.latency_ms ?? null,
    last_checked_at: latest?.timestamp ?? null,
    cert_expiry_days: s.cert?.[0] ?? null,
    cert_issuer: s.cert?.[1] ?? null,
    cert_checked_at: s.cert ? Math.floor(now / 1000) - 10_800 : null, // seconds, as the monitor writes it
  }
}

/** GET /projects, with each project's window and 14-day history when `statusHours` is given (capped at 24 h, like the API). */
export function demoProjects(now: number, statusHours?: number, anchor = now): Project[] {
  return allIds().map((id) => {
    const project = demoProject(id, now, anchor)
    return statusHours ? { ...project, status: demoStatus(id, Math.min(statusHours, 24), now, 14, anchor) } : project
  })
}

// ─── A visit's writes (the handler validates, these apply) ──────────────────

export interface DemoFields {
  name?: string
  url?: string
  failure_threshold?: number
  thresholds?: { min_uptime_pct: number; max_avg_latency_ms: number }
  accepted_status?: string
  notification_email?: string
  active?: boolean
}

export const demoExists = (id: string) => allIds().includes(id)

/** A new endpoint: pending until its first check lands, then healthy. */
export function addDemoEndpoint(fields: DemoFields, now: number): string {
  const base = (fields.name ?? 'endpoint').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'endpoint'
  let id = base
  for (let n = 2; demoExists(id); n++) id = `${base}-${n}`
  added.push({
    id,
    name: fields.name ?? id,
    url: fields.url ?? 'https://example.com',
    createdDaysAgo: 0,
    createdAtMs: now,
    threshold: fields.failure_threshold ?? 3,
    target: fields.thresholds ?? { min_uptime_pct: 99.9, max_avg_latency_ms: 300 },
    accepted: fields.accepted_status ?? '200-399',
    email: fields.notification_email,
    latency: [140, 60],
    stretches: [],
  })
  return id
}

/**
 * The visitor's edit. `active: false` stops the checks from now, as the API's
 * soft DELETE does.
 * shortcut: the app has no control to reactivate an endpoint, so `active: true`
 * is ignored here; and a new failure threshold also re-reads the past, where
 * the real record keeps the incidents it wrote. Revisit if either shows.
 */
export function editDemoEndpoint(id: string, fields: DemoFields, now: number): void {
  const current = story(id)
  const edit: Partial<Story> = { ...edits.get(id) }
  if (fields.name !== undefined) edit.name = fields.name
  if (fields.url !== undefined) edit.url = fields.url
  if (fields.failure_threshold !== undefined) edit.threshold = fields.failure_threshold
  if (fields.thresholds !== undefined) edit.target = fields.thresholds
  if (fields.accepted_status !== undefined) edit.accepted = fields.accepted_status
  if (fields.notification_email !== undefined) edit.email = fields.notification_email
  if (fields.active === false && current.pausedAtMs == null) edit.pausedAtMs = now
  edits.set(id, edit)
}

/** Forget the visit's changes (tests; a reload does the same). */
export function resetDemoVisit(): void {
  added.length = 0
  edits.clear()
}

/** The API's reliability metrics over [fromSec, nowSec] (`_reliability_metrics`). */
function reliability(list: Incident[], minUptime: number, fromSec: number, nowSec: number): ReliabilityMetrics {
  const windowSec = Math.max(nowSec - fromSec, 1)
  const open = list.filter((i) => !i.resolved)
  const inside = (i: Incident) => (i.duration_seconds ?? 0) - Math.max(fromSec - i.start_time, 0)
  const durations = list.filter((i) => i.resolved).map(inside)
  const openDowntime = open.length ? Math.max(nowSec - Math.max(open[0].start_time, fromSec), 0) : 0
  const total = durations.reduce((a, b) => a + b, 0) + openDowntime
  const repairs = list.filter((i) => i.resolved && !i.closed_reason).map((i) => i.duration_seconds ?? 0)
  const allowed = windowSec * (1 - minUptime / 100)
  return {
    incident_count: list.length,
    open_incident: open.length > 0,
    mttr_sec: repairs.length ? Math.round(repairs.reduce((a, b) => a + b, 0) / repairs.length) : 0,
    mtbf_sec: list.length ? Math.round(Math.max(windowSec - total, 0) / list.length) : null,
    longest_outage_sec: Math.max(0, ...durations, openDowntime),
    total_downtime_sec: total,
    downtime_pct: Math.round((total / windowSec) * 10_000) / 100,
    error_budget: {
      min_uptime_pct: minUptime,
      allowed_downtime_sec: Math.round(allowed),
      consumed_downtime_sec: total,
      remaining_sec: Math.round(allowed - total),
      burn_pct: allowed <= 0 ? (total ? 100 : 0) : Math.round((total / allowed) * 10_000) / 100,
      ok: total <= allowed,
    },
  }
}

/** GET /projects/{id}/incidents?days=N: those that began in the window, plus an earlier one still running into it. */
export function demoIncidents(id: string, days: number, now: number, anchor = now): IncidentsResponse {
  const r = resolve(story(id), now, anchor)
  const nowSec = Math.floor(now / 1000)
  const fromSec = nowSec - days * 86_400
  const all = incidents(r, now)
  const inside = all.filter((i) => i.start_time >= fromSec && i.start_time <= nowSec)
  const before = all.find((i) => i.start_time < fromSec)
  const list = before && (!before.resolved || (before.end_time ?? 0) > fromSec) ? [...inside, before] : inside
  return { project_id: id, window_days: days, incidents: list, metrics: reliability(list, r.story.target.min_uptime_pct, fromSec, nowSec) }
}

/** The report generator's verdict (`evaluate_sla`). */
/** A report over [fromMs, toMs), computed the way the report generator computes one. */
export function demoReport(
  id: string,
  reportId: string,
  fromMs: number,
  toMs: number,
  generatedAt: number,
  now: number,
  anchor = now,
): ProjectReport {
  const s = story(id)
  const r = resolve(s, now, anchor)
  const { up, down, inconclusive } = tally(r, toMinute(fromMs), toMinute(toMs))
  const conclusive = up + down
  const expected = Math.max(Math.floor((toMs - fromMs) / MIN), conclusive, 1)
  const latencies = demoChecks(id, fromMs, toMs - 1, now, anchor)
    .filter((c) => c.status === 'success')
    .map((c) => c.latency_ms)
    .sort((a, b) => a - b)
  const rank = (q: number) => latencies[Math.max(0, Math.ceil(latencies.length * q) - 1)] ?? 0
  const uptime = conclusive ? Math.round((up / conclusive) * 10_000) / 100 : 0
  const avg = latencies.length ? Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 10) / 10 : 0
  const coverage = Math.round((conclusive / expected) * 10_000) / 100
  const fromSec = Math.floor(fromMs / 1000)
  const toSec = Math.floor(toMs / 1000)
  // Incidents that overlap the window (#31), their time inside it.
  const overlapping = incidents(r, now).filter((i) => i.start_time < toSec && (i.end_time ?? toSec) > fromSec)
  return {
    project_id: id,
    report_id: reportId,
    uptime_pct: uptime,
    coverage_pct: coverage,
    checks_total: up + down + inconclusive,
    checks_up: up,
    checks_down: down,
    checks_inconclusive: inconclusive,
    checks_expected: expected,
    avg_latency_ms: avg,
    p95_latency_ms: rank(0.95),
    incident_count: overlapping.length,
    total_downtime_sec: downtimeIn(overlapping, fromSec, toSec),
    ...sloResult(s.target, uptime, avg, coverage),
    generated_at: new Date(generatedAt).toISOString(),
  }
}

// A weekly report expands a week of checks, and the page polls reports every
// minute; the history it reads only moves at midnight, so keep a day's worth.
const weekly = new Map<string, ProjectReport>()
let weeklyDay = -1

/** The last four weekly reports (Monday to Monday, generated Monday 08:00 UTC), oldest first like the API. */
export function demoReports(id: string, now: number, anchor = now): ProjectReport[] {
  if (weeklyDay !== dayStartMin(now)) {
    weekly.clear()
    weeklyDay = dayStartMin(now)
  }
  const s = story(id)
  const today = dayStartMin(now) * MIN
  const weekday = (new Date(today).getUTCDay() + 6) % 7 // Monday = 0
  let weekEnd = today - weekday * 86_400_000
  if (now < weekEnd + 8 * HOUR + 4_000) weekEnd -= 7 * 86_400_000 // this week's run has not finished yet
  const created = Date.parse(createdAt(s, anchor))
  const out: ProjectReport[] = []
  for (let k = 0; k < 4; k++) {
    const end = weekEnd - k * 7 * 86_400_000
    const start = end - 7 * 86_400_000
    if (start < created) break
    const monday = new Date(start)
    // ISO week number of the window's Monday.
    const thursday = new Date(start + 3 * 86_400_000)
    const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1)
    const week = Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7)
    const reportId = `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
    // Issued reports are records: they keep the targets they were judged against.
    const key = `${id}:${reportId}:${hourStartMin(anchor)}` // the stories read only the visit's hour
    if (!weekly.has(key)) weekly.set(key, demoReport(id, reportId, monday.getTime(), end, end + 8 * HOUR + 4_000, now, anchor))
    out.push({ ...(weekly.get(key) as ProjectReport) })
  }
  return out.reverse()
}

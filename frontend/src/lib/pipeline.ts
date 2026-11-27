/**
 * The Pipeline page's arithmetic (board #13), kept pure so `node --test` can load it.
 *
 * A monitor run stamps every check row with when the run started, when the
 * probe started and when the row was handed to DynamoDB; `timestamp` is when
 * the probe ended. Rows written before those fields existed have none of them,
 * and everything here degrades to what `timestamp` alone can say.
 */
import type { Check, Project } from '../types'

const MIN = 60_000
const HOUR = 3_600_000

/** One check's measured stages, in ms. */
export interface Stages {
  /** Run start to probe start: the projects scan plus the wait for a free worker. */
  startup: number
  /** Probe start to probe end, measured even when no response came. */
  probe: number
  /** Probe end to the write: the wait for the run's slowest probe and the rows written before this one. */
  hold: number
  total: number
}

/** A check's stages, or null for a row written before the monitor stamped them. */
export function stagesOf(check: Check): Stages | null {
  const { run_started_at: run, probe_started_at: probe, write_started_at: write } = check
  if (run == null || probe == null || write == null) return null
  // Wall-clock readings, not a monotonic clock: a clock step could make a stage negative.
  const startup = Math.max(0, probe - run)
  const probing = Math.max(0, check.timestamp - probe)
  const hold = Math.max(0, write - check.timestamp)
  return { startup, probe: probing, hold, total: startup + probing + hold }
}

/** The minute a check's run belongs to: by its run start, or by the probe's end on an older row. */
export const runMinute = (check: Check) => Math.floor((check.run_started_at ?? check.timestamp) / MIN)

/** The window every view on the page reads: the API's one-hour status window. */
export const recent = (project: Project, now: number) => (project.status?.checks ?? []).filter((c) => c.timestamp > now - HOUR)

export interface RunRow {
  project: Project
  check: Check
}

/** What one minute's run did with your endpoints. */
export interface RunSlot {
  /** Epoch minute. */
  minute: number
  /** Distinct run starts among the rows: 2 means an invocation ran twice (an async retry). */
  runs: number
  /** The earliest run start, when the rows carry one. */
  start: number | null
  rows: RunRow[]
  /** Active endpoints that already existed when this minute's run started. */
  expected: number
  /** Run start to the last of your rows' writes, when every row carries the stages. */
  duration: number | null
  /** Your checks in the run by verdict. */
  up: number
  down: number
  none: number
}

/**
 * The last hour as one slot per minute, oldest first, ending at the minute of
 * the newest run with your checks. Only minutes whose run falls inside the
 * hour of checks the API returns are listed, so a run cut off by the window's
 * edge never reads as missing. An empty slot only says no row of yours came
 * from that minute: a run that never happened and a run that skipped your
 * endpoints look the same from here.
 */
export function runSlots(projects: Project[], now: number): RunSlot[] {
  const active = projects.filter((p) => p.active)
  const offset = runOffset(projects, now)?.ms ?? 0
  const byMinute = new Map<number, RunRow[]>()
  for (const project of active)
    for (const check of recent(project, now)) {
      const minute = runMinute(check)
      byMinute.set(minute, [...(byMinute.get(minute) ?? []), { project, check }])
    }
  const last = byMinute.size ? Math.max(...byMinute.keys()) : Math.floor(now / MIN)
  const created = active.map((p) => Date.parse(p.created_at))

  const slots: RunSlot[] = []
  for (let minute = last - 59; minute <= last; minute++) {
    if (minute * MIN + offset <= now - HOUR) continue
    const rows = byMinute.get(minute) ?? []
    const starts = rows.map((r) => r.check.run_started_at).filter((s): s is number => s != null)
    const writes = rows.map((r) => r.check.write_started_at)
    const start = starts.length ? Math.min(...starts) : null
    const stamped = start != null && starts.length === rows.length && writes.every((w) => w != null)
    const count = (status: Check['status']) => rows.filter((r) => r.check.status === status).length
    slots.push({
      minute,
      runs: new Set(starts).size || (rows.length ? 1 : 0),
      start,
      rows,
      // An endpoint created during the minute may or may not have made that run, so it counts from the next.
      expected: created.filter((c) => c < minute * MIN).length,
      duration: stamped ? Math.max(0, Math.max(...(writes as number[])) - start) : null,
      up: count('success'),
      down: count('failure'),
      none: count('inconclusive'),
    })
  }
  return slots
}

/** Median of the run starts' (or, on older rows, the checks') second within the minute, in ms. */
export function runOffset(projects: Project[], now: number): { ms: number; stamped: boolean } | null {
  const checks = projects.filter((p) => p.active).flatMap((p) => recent(p, now))
  if (!checks.length) return null
  const stamped = checks.some((c) => c.run_started_at != null)
  const offsets = checks
    .filter((c) => !stamped || c.run_started_at != null)
    .map((c) => (c.run_started_at ?? c.timestamp) % MIN)
    .sort((a, b) => a - b)
  return { ms: offsets[Math.floor(offsets.length / 2)], stamped }
}

// ─── Events ─────────────────────────────────────────────────────────────────

export type EventKind = 'first' | 'failing' | 'down' | 'still' | 'up' | 'recovered' | 'noevidence' | 'gap'

export interface PipelineEvent {
  /** Epoch ms: the check the event is about, or for a gap the first missing minute. */
  at: number
  kind: EventKind
  project: Project
  /** One plain sentence. */
  text: string
  check?: Check
}

/** No row for longer than this between two checks means at least one run left none. */
const GAP_MS = 90_000

/**
 * What happened to each endpoint in the last hour, read off its check rows by
 * the monitor's alert rules, newest first. The down rule needs N failures in a
 * row with no check without a verdict among them; the recovery rule counts the
 * failures before a passing check, looking past checks without a verdict.
 * A healthy endpoint says nothing, and a long failure folds into one line.
 * Alerts say the rule was met, because whether an email went out is recorded
 * nowhere the page can read.
 */
export function deriveEvents(projects: Project[], now: number, limit = 50): PipelineEvent[] {
  const events: PipelineEvent[] = []
  for (const project of projects.filter((p) => p.active)) {
    const n = Math.max(1, project.failure_threshold ?? 3)
    const checks = recent(project, now)
    if (!checks.length) continue
    const emit = (at: number, kind: EventKind, text: string, check?: Check) => events.push({ at, kind, project, text, check })
    // The endpoint's first ever check: nothing came before it.
    const fresh = checks[0].timestamp - Date.parse(project.created_at) < GAP_MS
    if (fresh) emit(checks[0].timestamp, 'first', 'First check.', checks[0])

    // Otherwise the window may open partway through a run whose start it
    // cannot see: the down rule's count is known after the first check that is
    // not a failure, the recovery rule's only after the first passing one.
    const since = fmtHm(checks[0].timestamp)
    let streakKnown = fresh || checks[0].status !== 'failure'
    let failsKnown = fresh || checks[0].status === 'success'
    let streak = 0 // failures in a row; a check without a verdict breaks it (the down rule)
    let fails = 0 // failures since the last passing check, looking past checks without a verdict (the recovery rule)
    let blank: Check[] = []
    const flushBlank = () => {
      if (!blank.length) return
      const cause = blank[0].error_type === 'blocked' ? ': the probe was blocked' : ''
      emit(blank[0].timestamp, 'noevidence', blank.length === 1 ? `No verdict${cause}.` : `No verdict for ${blank.length} checks in a row${cause}.`, blank[0])
      blank = []
    }

    checks.forEach((check, i) => {
      const prev = checks[i - 1]
      if (prev && check.timestamp - prev.timestamp > GAP_MS) {
        flushBlank()
        const missed = Math.round((check.timestamp - prev.timestamp) / MIN) - 1
        if (missed > 0) emit(prev.timestamp + MIN, 'gap', `No check for ${missed} minute${missed === 1 ? '' : 's'}.`)
      }
      if (check.status === 'inconclusive') {
        streak = 0
        streakKnown = true
        blank.push(check)
        return
      }
      flushBlank()
      if (check.status === 'failure') {
        streak += 1
        fails += 1
        if (streakKnown && streak === n) emit(check.timestamp, 'down', `Failure ${n} of ${n} in a row: the down alert rule is met.`, check)
        // Steps toward an alert, but not again for failures that only follow a check without a verdict.
        else if (failsKnown && streak < n && fails === streak) emit(check.timestamp, 'failing', `Failure ${streak} of ${n} in a row.`, check)
        return
      }
      const plus = failsKnown ? '' : '+'
      if (fails >= n) emit(check.timestamp, 'up', `Back up after ${fails}${plus} failures: the recovery alert rule is met.`, check)
      else if (!failsKnown && !streakKnown) emit(check.timestamp, 'recovered', `Back up after a run of failures that began before ${since} UTC.`, check)
      else if (fails > 0) emit(check.timestamp, 'recovered', `Back up after ${fails} failure${fails === 1 ? '' : 's'}, short of the alert threshold.`, check)
      streak = 0
      fails = 0
      streakKnown = true
      failsKnown = true
    })
    flushBlank()

    const last = checks[checks.length - 1]
    if (last.status !== 'failure' || events[events.length - 1]?.check === last) continue // the last check already spoke
    if (!streakKnown) emit(last.timestamp, 'still', `Still failing, since before ${since} UTC.`, last)
    else if (fails > n) emit(last.timestamp, 'still', `Still failing: ${fails}${failsKnown ? '' : '+'} failures since the last passing check.`, last)
  }
  // Newest first; at the same moment, the later-told event goes on top.
  return events
    .reverse()
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
}

/** Epoch ms → "HH:MM", UTC. */
const fmtHm = (ms: number) => new Date(ms).toISOString().slice(11, 16)

/** What the next hourly pass of the SLA processor will write, judging by the checks in view. */
export interface PassQueue {
  /** Outages that reached the threshold since the last pass: the next pass opens their incidents. */
  open: number
  /** Outages already recorded at the last pass that have since recovered: the next pass closes them. */
  close: number
}

/**
 * Counts what the processor's next pass will record, by its rule: any check
 * that is not a failure ends a failure run, and a run of N or more is an
 * incident. A run the window cut at its start is counted only when the window
 * alone holds N of its failures.
 */
export function passQueue(projects: Project[], now: number): PassQueue {
  const lastPass = Math.floor(now / HOUR) * HOUR
  const queue: PassQueue = { open: 0, close: 0 }
  for (const project of projects.filter((p) => p.active)) {
    const n = Math.max(1, project.failure_threshold ?? 3)
    const checks = recent(project, now)
    let run: Check[] = []
    const settle = (next: Check | undefined) => {
      if (run.length >= n) {
        const reached = run[n - 1].timestamp
        if (reached >= lastPass) queue.open += 1
        // Recorded at the last pass, but only a passing check ends it there.
        else if (next?.status === 'success' && next.timestamp >= lastPass) queue.close += 1
      }
      run = []
    }
    checks.forEach((check, i) => {
      if (check.status === 'failure') run.push(check)
      else {
        // An incident stays open past a check without a verdict: it is the next passing check that closes it.
        const next = check.status === 'success' ? check : checks.slice(i + 1).find((c) => c.status === 'success')
        settle(next)
      }
    })
    settle(undefined)
  }
  return queue
}

/** A duration in ms → "312 ms" or "10.3 s". */
export function fmtMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`
}

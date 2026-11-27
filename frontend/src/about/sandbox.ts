import type { Check, Incident } from '../types'

/**
 * The SLA processor's hourly pass (process_project in sla_processor/handler.py)
 * for an active endpoint, so the About page's streak sandbox writes its incident
 * record by the backend's own rules. Checks are oldest first.
 */

const HOUR = 3_600_000
const sec = (ms: number) => Math.floor(ms / 1000)

/** find_failure_runs: N or more failures in a row; anything else, no-evidence included, ends a run. */
function failureRuns(checks: Check[], n: number) {
  const runs: { start: number; end: number }[] = []
  let run: Check[] = []
  for (const c of [...checks, null]) {
    if (c?.status === 'failure') run.push(c)
    else {
      if (run.length >= n) runs.push({ start: run[0].timestamp, end: run[run.length - 1].timestamp })
      run = []
    }
  }
  return runs
}

export function hourlyPass(checks: Check[], incidents: Incident[], threshold: number, now: number): Incident[] {
  const record = incidents.map((i) => ({ ...i }))
  const passAfter = (list: Check[], ms: number) => list.find((c) => c.status === 'success' && c.timestamp > ms)?.timestamp
  const close = (inc: Incident, ms: number) => {
    inc.end_time = sec(ms)
    inc.duration_seconds = sec(ms) - inc.start_time
    inc.resolved = true
  }

  // Step 1: settle the incident carried over, at the first passing check after it began.
  let open = record.find((i) => !i.resolved)
  let closedAt: number | null = null
  if (open) {
    const back = passAfter(checks, open.start_time * 1000)
    if (back != null) {
      close(open, back)
      closedAt = sec(back)
      open = undefined
    }
  }

  // Step 2: the last two hours' failure runs, oldest first.
  const window = checks.filter((c) => c.timestamp >= now - 2 * HOUR && c.timestamp <= now)
  for (const run of failureRuns(window, threshold)) {
    const start = sec(run.start)
    if (open || (closedAt != null && start <= closedAt)) continue
    // run_on_record: the latest incident that began before the run ended, if it overlaps it.
    const latest = record.filter((i) => i.start_time <= sec(run.end)).sort((a, b) => b.start_time - a.start_time)[0]
    if (latest && (!latest.resolved || (latest.end_time ?? 0) >= start)) continue
    const inc: Incident = { project_id: 'sandbox', start_time: start, end_time: null, duration_seconds: null, resolved: false }
    record.push(inc)
    const back = passAfter(window, run.end)
    if (back != null) {
      close(inc, back)
      closedAt = sec(back)
    } else open = inc
  }
  return record.sort((a, b) => a.start_time - b.start_time)
}

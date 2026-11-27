// The demo dataset (src/demo/data.ts): every endpoint tells its story, and every view agrees. Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STORIES, addDemoEndpoint, demoChecks, demoDaily, demoIncidents, demoProject, demoProjects, demoReports, demoStatus, editDemoEndpoint, resetDemoVisit } from '../src/demo/data.ts'
import { readFileSync } from 'node:fs'
import { MAX_ACTIVE_PROJECTS, dayVerdict, incidentState, verdictFor } from '../src/lib/format.ts'
import { handle } from '../src/demo/handler.ts'
import { DEMO_USER } from '../src/lib/demo.ts'

const MIN = 60_000
const H = Date.UTC(2026, 10, 25, 14) // Wed 25 Nov 2026, 14:00 UTC
const TIMES = { 'just after the hour': H + 30_000, 'mid-hour': H + 31 * MIN + 7_000, 'just before the next hour': H + 59 * MIN + 30_000 }

/** Checkout's 1h40m outage nine days before 25 Nov, as the incident record holds it. */
const longOutage = (now) =>
  demoIncidents('checkout', 30, now).incidents.find((i) => new Date(i.start_time * 1000).toISOString().startsWith('2026-11-16'))

function judge(id, now, anchor = now) {
  const project = demoProject(id, now, anchor)
  const { checks } = demoStatus(id, 24, now, 30, anchor)
  const { incidents, metrics } = demoIncidents(id, 30, now, anchor)
  const verdict = verdictFor({ ...project, open_incident: metrics.open_incident }, now)
  const state = incidentState({ checks, threshold: project.failure_threshold, incidents, active: true, verdict, now })
  return { verdict, stage: state.stage, record: state.record.kind }
}

test('each endpoint shows its state through the hour', () => {
  const expected = {
    storefront: { verdict: 'up', stage: 'healthy', record: 'none' },
    'public-api': { verdict: 'up', stage: 'healthy', record: 'none' },
    checkout: { verdict: 'down', stage: 'open', record: 'open' },
    auth: { verdict: 'up', stage: 'recovering', record: 'closing' },
    docs: { verdict: 'down', stage: 'suspect', record: 'none' },
    www: { verdict: 'inconclusive', stage: null, record: 'none' },
  }
  for (const [when, now] of Object.entries(TIMES)) {
    for (const [id, want] of Object.entries(expected)) assert.deepEqual(judge(id, now), want, `${id}, ${when}`)
    assert.equal(judge('legacy', now).verdict, 'stale', `legacy, ${when}`)
  }
  // The hour's first check lands 20-27 s in: until then Sign-in is still down, as on the real stack.
  assert.deepEqual(judge('auth', H + 5_000), { verdict: 'down', stage: 'open', record: 'open' })
  assert.deepEqual(judge('docs', H + 5_000).stage, 'suspect')
  // A stale monitor over the whole hour: nothing in the last hour by its end.
  const late = H + 59 * MIN + 59_000
  assert.deepEqual([judge('legacy', late).verdict, judge('legacy', late).stage], ['stale', null])
  assert.equal(demoStatus('legacy', 1, late).summary.coverage_pct, 0)
})

test('within a visit the stories move on like the real system', () => {
  const arrived = TIMES['mid-hour']
  const later = H + 61 * MIN + 30_000 // after the next hourly pass
  assert.deepEqual(judge('auth', later, arrived), { verdict: 'up', stage: 'healthy', record: 'none' })
  assert.deepEqual(judge('checkout', later, arrived), { verdict: 'down', stage: 'open', record: 'open' })
  const start = (now) => demoIncidents('checkout', 30, now, arrived).incidents[0].start_time
  assert.equal(start(later), start(arrived)) // history does not jump at the top of the hour
  // Nor at midnight, nor in a tab left open for days.
  const starts = (now) => demoIncidents('public-api', 30, now, arrived).incidents.map((i) => i.start_time)
  assert.deepEqual(starts(Date.UTC(2026, 10, 26, 0, 30)), starts(arrived))
  const days = demoDaily('checkout', 30, arrived + 10 * 1440 * MIN, arrived).days
  assert.ok(days.every((d) => d.up >= 0 && d.down >= 0))
  assert.equal(demoIncidents('checkout', 30, arrived + 10 * 1440 * MIN, arrived).incidents.filter((i) => !i.resolved).length, 1)
})

test('the same moment always gives the same data', () => {
  const now = TIMES['mid-hour']
  assert.deepEqual(demoProjects(now, 1), demoProjects(now, 1))
  assert.deepEqual(demoReports('checkout', now), demoReports('checkout', now))
  // A minute later the window slides, but the minutes it shares are unchanged. The newest
  // three are left out: Docs' two timeouts are always its latest checks (board #39), and a
  // timeout holds the writes of every row in its run.
  const shared = (list) => list.filter((c) => c.timestamp >= now - 30 * MIN && c.timestamp < now - 3 * MIN)
  assert.deepEqual(shared(demoChecks('storefront', now - 60 * MIN, now, now)), shared(demoChecks('storefront', now - 59 * MIN, now + MIN, now + MIN)))
})

test('demo rows carry stage times the way the monitor stamps them', () => {
  const now = TIMES['mid-hour']
  const rows = STORIES.flatMap(({ id }) => demoChecks(id, now - 60 * MIN, now, now))
  const runs = new Map()
  for (const c of rows) {
    assert.ok(c.run_started_at <= c.probe_started_at && c.probe_started_at <= c.timestamp && c.timestamp <= c.write_started_at, `${c.timestamp}: stages in order`)
    runs.set(c.run_started_at, [...(runs.get(c.run_started_at) ?? []), c])
  }
  for (const [start, run] of runs) {
    assert.equal(new Set(run.map((c) => Math.floor(c.timestamp / MIN))).size, 1, 'a run is one minute')
    // Nothing is written until the slowest probe of the run is back.
    const slowest = Math.max(...run.map((c) => c.timestamp))
    assert.ok(run.every((c) => c.write_started_at > slowest), `run at ${start}: rows wait for the slowest probe`)
  }
  // Docs' latest timeout holds every row of the newest run for about ten seconds.
  const newest = runs.get(Math.max(...runs.keys()))
  assert.ok(newest.every((c) => c.write_started_at - c.run_started_at > 10_000))
  // A refused connection stores the 10 s placeholder but takes milliseconds.
  const refused = demoChecks('checkout', now - 5 * MIN, now, now).at(-1)
  assert.equal(refused.latency_ms, 10_000)
  assert.ok(refused.timestamp - refused.probe_started_at < 100)
})

test('every recorded incident is a run of failures the checks show', () => {
  const now = TIMES['mid-hour']
  for (const { id, threshold } of STORIES) {
    const checks = demoChecks(id, now - 31 * 1440 * MIN, now, now)
    for (const incident of demoIncidents(id, 30, now).incidents) {
      const i = checks.findIndex((c) => Math.floor(c.timestamp / 1000) === incident.start_time)
      assert.ok(i > 0, `${id}: its first failure is a check`)
      assert.notEqual(checks[i - 1].status, 'failure', `${id}: the run starts there`)
      assert.ok(checks.slice(i, i + threshold).every((c) => c.status === 'failure'), `${id}: at least ${threshold} in a row`)
    }
  }
  // Two failures in a row lower availability but never open an incident.
  assert.equal(demoIncidents('public-api', 30, now).incidents.length, 3)
})

test('day tallies match the checks, and the long outage marks its day', () => {
  const now = TIMES['mid-hour']
  for (const { id } of STORIES) {
    const today = demoDaily(id, 30, now).days.at(-1)
    const checks = demoChecks(id, Date.UTC(2026, 10, 25), now, now)
    const count = (status) => checks.filter((c) => c.status === status).length
    assert.deepEqual([today.up, today.down, today.inconclusive], [count('success'), count('failure'), count('inconclusive')], id)
  }
  const daily = demoDaily('checkout', 30, now)
  const outage = daily.days.find((d) => d.date === '2026-11-16')
  const incident = longOutage(now)
  assert.equal(outage.outage_sec, incident.duration_seconds)
  assert.ok(Math.abs(incident.duration_seconds - 100 * 60) <= 5) // checks land a few seconds apart
  assert.equal(dayVerdict(outage, daily.since, demoProject('checkout', now).created_at, now).verdict, 'outage')
  // Seconds after midnight: no check yet today, and the open outage already marks the day.
  const midnight = Date.UTC(2026, 10, 26, 0, 0, 5)
  const fresh = demoDaily('storefront', 30, midnight)
  assert.equal(dayVerdict(fresh.days.at(-1), fresh.since, demoProject('storefront', midnight).created_at, midnight).verdict, 'no_data')
  const down = demoDaily('checkout', 30, midnight)
  assert.equal(dayVerdict(down.days.at(-1), down.since, demoProject('checkout', midnight).created_at, midnight).verdict, 'outage')
})

test('weekly reports count the same checks, and the outage week is missed', () => {
  const now = TIMES['mid-hour']
  const reports = demoReports('checkout', now)
  assert.deepEqual(reports.map((r) => r.report_id), ['2026-W44', '2026-W45', '2026-W46', '2026-W47']) // ascending, like the API
  const w47 = reports.at(-1)
  const checks = demoChecks('checkout', Date.UTC(2026, 10, 16), Date.UTC(2026, 10, 23) - 1, now)
  assert.equal(w47.checks_up + w47.checks_down + w47.checks_inconclusive, checks.length)
  assert.equal(w47.checks_down, checks.filter((c) => c.status === 'failure').length)
  assert.deepEqual([w47.slo_status, w47.incident_count, w47.total_downtime_sec], ['missed', 1, longOutage(now).duration_seconds])
  assert.equal(demoReports('storefront', now).at(-1).slo_status, 'met')
  // A week's report exists from the Monday 08:00 run, and ISO weeks cross the year correctly.
  const monday = Date.UTC(2026, 10, 30, 8)
  assert.equal(demoReports('storefront', monday - 1_000).at(-1).report_id, '2026-W47')
  assert.equal(demoReports('storefront', monday + 5_000).at(-1).report_id, '2026-W48')
  assert.equal(demoReports('storefront', Date.UTC(2027, 0, 4, 9)).at(-1).report_id, '2026-W53')
})

test('the dashboard list carries each window and 14 days of history', () => {
  const list = demoProjects(TIMES['mid-hour'], 1)
  assert.equal(list.length, STORIES.length)
  for (const p of list) {
    assert.equal(p.status.summary.window_hours, 1)
    assert.equal(p.status.daily.days.length, 14)
  }
})

test('a visit\'s changes: add, delete while down, and a new threshold', () => {
  resetDemoVisit()
  const t0 = TIMES['mid-hour']
  const id = addDemoEndpoint({ name: 'Status page', url: 'https://status.example.com' }, t0)
  assert.equal(id, 'status-page')
  assert.equal(judge(id, t0 + 5_000).verdict, 'pending') // its first check has not landed
  assert.equal(judge(id, t0 + 2 * MIN).verdict, 'up')
  assert.equal(demoProjects(t0, 1).length, STORIES.length + 1)

  // Paused while down: still down while the incident is open, closed as monitoring stopped at the next pass.
  editDemoEndpoint('checkout', { active: false }, t0)
  assert.equal(demoProject('checkout', t0 + MIN, t0).active, false)
  const open = demoIncidents('checkout', 30, t0 + 10 * MIN, t0).incidents[0]
  assert.equal(open.resolved, false)
  const closed = demoIncidents('checkout', 30, H + 61 * MIN, t0).incidents[0]
  assert.equal(closed.closed_reason, 'monitoring_stopped')
  const lastCheck = demoChecks('checkout', t0 - 5 * MIN, H + 61 * MIN, H + 61 * MIN, t0).at(-1)
  assert.equal(closed.end_time, Math.floor(lastCheck.timestamp / 1000))

  // Deleted endpoints stay deleted: no checks after the pause.
  assert.ok(!demoChecks('checkout', t0, H + 90 * MIN, H + 90 * MIN, t0).some((c) => c.timestamp > t0))

  // A lower threshold: two timeouts in a row are now an incident, not yet on record.
  editDemoEndpoint('docs', { failure_threshold: 2 }, t0)
  assert.deepEqual(judge('docs', t0 + MIN), { verdict: 'down', stage: 'open', record: 'missing' })
  resetDemoVisit()
  assert.equal(demoProjects(t0).length, STORIES.length)
})

test('the frontend\'s endpoint limit is the project manager\'s', () => {
  const handler = readFileSync(new URL('../../sla-monitor-terraform/lambda_src/project_manager/handler.py', import.meta.url), 'utf8')
  assert.equal(Number(handler.match(/^MAX_ACTIVE_PROJECTS = (\d+)$/m)?.[1]), MAX_ACTIVE_PROJECTS)
})

test('the demo holds an account to 10 active endpoints, with the API\'s message', async () => {
  resetDemoVisit()
  try {
    // Seven stories, all active (a stale one still counts): three more reach the limit.
    for (const n of [1, 2, 3]) await handle('POST', '/projects', { name: `Extra ${n}`, url: `https://extra${n}.example.com` })
    await assert.rejects(handle('POST', '/projects', { name: 'One more', url: 'https://more.example.com' }), {
      message: 'This account is at its limit of 10 monitored endpoints. Delete one to make room.',
    })
    // A deleted endpoint frees its place.
    await handle('DELETE', '/projects/extra-1')
    assert.equal((await handle('POST', '/projects', { name: 'One more', url: 'https://more.example.com' })).project_id, 'one-more')
  } finally {
    resetDemoVisit()
  }
})

test('the handler answers writes the way the API does, messages included', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] }) // the JSON download's revoke timer would hold the run open
  resetDemoVisit()
  const visitor = { ...DEMO_USER }
  try {
    await assert.rejects(handle('POST', '/projects', { name: 'Shop' }), /^Error: name and url are required$/)
    await assert.rejects(handle('POST', '/projects', { name: 'Shop', url: 'ftp://shop.dev' }), /url must start with http:\/\/ or https:\/\//)
    await assert.rejects(handle('POST', '/projects', { name: 'Shop', url: 'https://shop.dev', accepted_status: '299-200' }), /accepted_status must be a status list/)
    const created = await handle('POST', '/projects', { name: ' Status page ', url: 'https://status.example.com', accepted_status: '200-299, 404' })
    assert.equal(created.project_id, 'status-page')
    assert.equal(created.name, 'Status page')
    assert.equal(created.accepted_status, '200-299,404')
    assert.equal(created.failure_threshold, 3)
    assert.equal(created.notification_email, DEMO_USER.email)
    assert.ok((await handle('GET', '/projects')).some((p) => p.project_id === 'status-page'))

    await assert.rejects(handle('PUT', '/projects/checkout', {}), /^Error: No fields provided$/)
    await assert.rejects(handle('PUT', '/projects/checkout', { failure_threshold: 11 }), /failure_threshold must be an integer between 1 and 10/)
    assert.equal((await handle('PUT', '/projects/checkout', { name: 'Checkout (EU)' })).name, 'Checkout (EU)')
    await assert.rejects(handle('GET', '/projects/nobody'), /^Error: Forbidden$/)

    await assert.rejects(handle('POST', '/projects/checkout/reports', { days: 2 }), /days must be 1, 7, or 30/)
    const { report_id } = await handle('POST', '/projects/checkout/reports', { days: 7 })
    assert.match(report_id, /^7d-\d{4}-\d{2}-\d{2}$/)
    const ids = (await handle('GET', '/projects/checkout/reports')).map((r) => r.report_id)
    assert.deepEqual(ids, [...ids].sort()) // sort-key order, as DynamoDB returns them
    assert.ok(ids.includes(report_id))
    assert.equal((await handle('GET', `/projects/checkout/reports/${report_id}/download?format=html`)).url, '/demo/sample-report.html')
    assert.match((await handle('GET', `/projects/checkout/reports/${report_id}/download?format=json`)).url, /^blob:/)
    await assert.rejects(handle('GET', '/projects/checkout/reports/2001-W01/download'), /^Error: Report not found$/)

    await assert.rejects(handle('PUT', '/me', { notification_email: `${'a'.repeat(250)}@x.io` }), /notification_email must be a valid email address/)
    assert.equal((await handle('PUT', '/me', { display_name: ' Ada ' })).display_name, 'Ada')
    assert.equal((await handle('GET', '/me')).display_name, 'Ada')

    assert.equal(await handle('DELETE', '/projects/status-page'), undefined)
    assert.equal((await handle('GET', '/projects/status-page')).active, false)
  } finally {
    Object.assign(DEMO_USER, visitor)
    resetDemoVisit()
  }
})

// The demo dataset (src/demo/data.ts): every endpoint tells its story, and every view agrees. Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STORIES, demoChecks, demoDaily, demoIncidents, demoProject, demoProjects, demoReports, demoStatus } from '../src/demo/data.ts'
import { dayVerdict, incidentState, verdictFor } from '../src/lib/format.ts'

const MIN = 60_000
const H = Date.UTC(2026, 10, 25, 14) // Wed 25 Nov 2026, 14:00 UTC
const TIMES = { 'just after the hour': H + 30_000, 'mid-hour': H + 31 * MIN + 7_000, 'just before the next hour': H + 59 * MIN + 30_000 }

/** Checkout's 3h12m outage nine days before 25 Nov, as the incident record holds it. */
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
})

test('the same moment always gives the same data', () => {
  const now = TIMES['mid-hour']
  assert.deepEqual(demoProjects(now, 1), demoProjects(now, 1))
  assert.deepEqual(demoReports('checkout', now), demoReports('checkout', now))
  // A minute later the window slides, but the minutes it shares are unchanged.
  const shared = (list) => list.filter((c) => c.timestamp >= now - 30 * MIN && c.timestamp < now - MIN)
  assert.deepEqual(shared(demoChecks('storefront', now - 60 * MIN, now, now)), shared(demoChecks('storefront', now - 59 * MIN, now + MIN, now + MIN)))
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
  assert.ok(Math.abs(incident.duration_seconds - 192 * 60) <= 5) // checks land a few seconds apart
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

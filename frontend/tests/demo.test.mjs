// The demo dataset (src/demo/data.ts): every endpoint tells its story, and every view agrees. Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STORIES, demoChecks, demoDaily, demoIncidents, demoProject, demoProjects, demoReports, demoStatus } from '../src/demo/data.ts'
import { dayVerdict, incidentState, verdictFor } from '../src/lib/format.ts'

const MIN = 60_000
const H = Date.UTC(2026, 10, 25, 14) // Wed 25 Nov 2026, 14:00 UTC
const TIMES = { 'just after the hour': H + 30_000, 'mid-hour': H + 31 * MIN + 7_000, 'just before the next hour': H + 59 * MIN + 30_000 }

function judge(id, now) {
  const project = demoProject(id, now)
  const { checks } = demoStatus(id, 24, now)
  const { incidents, metrics } = demoIncidents(id, 30, now)
  const verdict = verdictFor({ ...project, open_incident: metrics.open_incident }, now)
  const state = incidentState({ checks, threshold: project.failure_threshold, incidents, active: true, verdict, now })
  return { verdict, stage: state.stage, record: state.record.kind }
}

test('each endpoint shows its state at any point in the hour', () => {
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
    const checks = demoChecks(id, now - 72 * 60 * MIN, now, now)
    for (const incident of demoIncidents(id, 3, now).incidents) {
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
  assert.equal(outage.outage_sec, 192 * 60)
  assert.equal(dayVerdict(outage, daily.since, demoProject('checkout', now).created_at, now).verdict, 'outage')
})

test('weekly reports count the same checks, and the outage week is missed', () => {
  const now = TIMES['mid-hour']
  const reports = demoReports('checkout', now)
  assert.deepEqual(reports.map((r) => r.report_id), ['2026-W47', '2026-W46', '2026-W45', '2026-W44'])
  const [w47] = reports
  const checks = demoChecks('checkout', Date.UTC(2026, 10, 16), Date.UTC(2026, 10, 23) - 1, now)
  assert.equal(w47.checks_up + w47.checks_down + w47.checks_inconclusive, checks.length)
  assert.equal(w47.checks_down, checks.filter((c) => c.status === 'failure').length)
  assert.deepEqual([w47.slo_status, w47.incident_count, w47.total_downtime_sec], ['missed', 1, 192 * 60])
  assert.equal(demoReports('storefront', now)[0].slo_status, 'met')
})

test('the dashboard list carries each window and 14 days of history', () => {
  const list = demoProjects(TIMES['mid-hour'], 1)
  assert.equal(list.length, STORIES.length)
  for (const p of list) {
    assert.equal(p.status.summary.window_hours, 1)
    assert.equal(p.status.daily.days.length, 14)
  }
})

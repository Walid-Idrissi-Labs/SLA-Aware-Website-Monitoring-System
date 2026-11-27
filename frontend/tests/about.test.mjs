// The About page's sandboxes run the backend's rules in the browser: the SLA
// processor's hourly pass (src/about/sandbox.ts) and the report's availability
// and SLO verdict (src/lib/format.ts). Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hourlyPass } from '../src/about/sandbox.ts'
import { availability, sloResult } from '../src/lib/format.ts'

const MIN = 60_000
const T0 = Date.UTC(2026, 10, 27, 10, 0)
const S = { P: 'success', F: 'failure', I: 'inconclusive' }
/** "PPFFFP" → one check a minute from T0. */
const seq = (pattern, from = T0) => [...pattern].map((ch, i) => ({ timestamp: from + i * MIN, status: S[ch], latency_ms: 100, http_status_code: 200 }))
const at = (i) => (T0 + i * MIN) / 1000
const after = (checks) => checks.at(-1).timestamp + 30_000

test('a run shorter than the threshold is never recorded', () => {
  const checks = seq('PPPFFPPP')
  assert.deepEqual(hourlyPass(checks, [], 3, after(checks)), [])
})

test('an outage that recovered inside the window is opened and closed in one pass', () => {
  const checks = seq('PPFFFFPP')
  const [inc] = hourlyPass(checks, [], 3, after(checks))
  assert.equal(inc.start_time, at(2))
  assert.equal(inc.end_time, at(6))
  assert.equal(inc.duration_seconds, 4 * 60)
  assert.equal(inc.resolved, true)
})

test('an outage still going stays open, and the next pass closes it at the first passing check', () => {
  const down = seq('PPFFFF')
  const first = hourlyPass(down, [], 3, after(down))
  assert.equal(first.length, 1)
  assert.equal(first[0].resolved, false)
  assert.equal(first[0].end_time, null)

  const later = seq('PPFFFFFIPP')
  const second = hourlyPass(later, first, 3, after(later))
  assert.equal(second.length, 1, 'the run already on record is not opened twice')
  assert.equal(second[0].end_time, at(8), 'a no-evidence check is not a recovery')
  assert.equal(second[0].resolved, true)
})

test('a no-evidence check breaks a run, so it cannot open an incident', () => {
  const checks = seq('PPFFIFFPP')
  assert.deepEqual(hourlyPass(checks, [], 3, after(checks)), [])
})

test('running the pass again changes nothing', () => {
  const checks = seq('PFFFPPFFFFP')
  const once = hourlyPass(checks, [], 3, after(checks))
  assert.equal(once.length, 2, 'two separate outages, two incidents')
  assert.deepEqual(hourlyPass(checks, once, 3, after(checks)), once)
})

test('the pass reads two hours back, no further', () => {
  const old = seq('FFFF', T0 - 3 * 60 * MIN)
  const recent = seq('PPPP')
  assert.deepEqual(hourlyPass([...old, ...recent], [], 3, after(recent)), [])
})

test('availability counts conclusive checks only, and coverage against what was expected', () => {
  assert.deepEqual(availability(0, 0, 100), { uptime: null, coverage: 0 })
  assert.deepEqual(availability(10, 0, 100), { uptime: 100, coverage: 10 })
  assert.deepEqual(availability(99, 1, 100), { uptime: 99, coverage: 100 })
  assert.deepEqual(availability(2, 1, 0), { uptime: 66.67, coverage: 100 }, 'rounded to 2 places, expected never below the conclusive count')
})

test('the SLO verdict: unproven below 95% coverage, severity from uptime', () => {
  const target = { min_uptime_pct: 99.9, max_avg_latency_ms: 300 }
  assert.equal(sloResult(target, 100, 120, 94.99).slo_status, 'unproven')
  assert.deepEqual(sloResult(target, 99.9, 120, 95), { sla_pass: true, severity: 'healthy', slo_status: 'met' })
  assert.equal(sloResult(target, 99.95, 301, 100).slo_status, 'missed', 'latency counts too')
  assert.equal(sloResult(target, 99.5, 120, 100).severity, 'degraded')
  assert.equal(sloResult(target, 97, 120, 100).severity, 'major')
  assert.equal(sloResult(target, 90, 120, 100).severity, 'critical')
})

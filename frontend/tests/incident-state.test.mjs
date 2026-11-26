// Incident lifecycle from the checks, cross-checked against the record (lib/format.ts incidentState). Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { incidentState } from '../src/lib/format.ts'

const H = 1_800_000_000_000 - (1_800_000_000_000 % 3_600_000) // a top of the hour, in ms
const NOW = H + 30 * 60_000
const STATUS = { S: 'success', F: 'failure', I: 'inconclusive' }
/** One check a minute, oldest first, the last one at `end`. */
const seq = (pattern, end = NOW - 30_000) =>
  [...pattern].map((ch, i, all) => ({ timestamp: end - (all.length - 1 - i) * 60_000, status: STATUS[ch], latency_ms: 100, http_status_code: 200 }))
const sec = (ms) => Math.floor(ms / 1000)
const openRow = (startMs) => ({ project_id: 'p', start_time: sec(startMs), end_time: null, duration_seconds: null, resolved: false })
const closedRow = (startMs, endMs) => ({ project_id: 'p', start_time: sec(startMs), end_time: sec(endMs), duration_seconds: sec(endMs) - sec(startMs), resolved: true })
const state = (checks, incidents = [], extra = {}) =>
  incidentState({ checks, threshold: 3, incidents, active: true, verdict: 'up', now: NOW, ...extra })

test('healthy, then suspect while failures stay under the threshold', () => {
  assert.deepEqual([state(seq('SSS')).stage, state(seq('SSS')).record.kind], ['healthy', 'none'])
  const checks = seq('SFF')
  const s = state(checks)
  assert.deepEqual([s.stage, s.streak, s.since], ['suspect', 2, checks[1].timestamp])
})

test('N failures in a row open an incident, on record or not yet', () => {
  const checks = seq('SFFF')
  const fresh = state(checks)
  assert.equal(fresh.stage, 'open')
  assert.deepEqual(fresh.record, { kind: 'missing', pass: H + 3_600_000, overdue: false })
  const recorded = state(checks, [openRow(checks[1].timestamp)])
  assert.deepEqual([recorded.stage, recorded.record.kind, recorded.since], ['open', 'open', checks[1].timestamp])
})

test('an inconclusive check keeps an open incident open, but resets a streak below it', () => {
  const checks = seq('SFFFII')
  assert.deepEqual([state(checks).stage, state(checks).since], ['open', checks[1].timestamp])
  const reset = state(seq('SFFI'))
  assert.deepEqual([reset.stage, reset.blank, reset.reset], [null, 'no_evidence', 2])
})

test('recovering until the hourly pass closes or records the outage', () => {
  const checks = seq('FFFS')
  const closing = state(checks, [openRow(checks[0].timestamp)])
  assert.deepEqual([closing.stage, closing.since, closing.downFor], ['recovering', checks[3].timestamp, 180])
  assert.deepEqual(closing.record, { kind: 'closing', since: checks[0].timestamp, pass: H + 3_600_000, overdue: false })
  assert.deepEqual([state(checks).stage, state(checks).record.kind], ['recovering', 'missing'])
  const settled = state(checks, [closedRow(checks[0].timestamp, checks[3].timestamp)])
  assert.deepEqual([settled.stage, settled.record.kind], ['healthy', 'none'])
})

test('a new outage after a recovery is its own, not the record still closing', () => {
  const checks = seq('FFFSFFF')
  const s = state(checks, [openRow(checks[0].timestamp)])
  assert.deepEqual([s.stage, s.record.kind, s.since], ['open', 'missing', checks[4].timestamp])
  const relapse = state(seq('FFFSF'), [openRow(seq('FFFSF')[0].timestamp)])
  assert.deepEqual([relapse.stage, relapse.record.kind], ['suspect', 'closing'])
})

test('a record that should have caught up by now reads as overdue', () => {
  const s = state(seq('S' + 'F'.repeat(50)))
  assert.deepEqual([s.stage, s.record.kind, s.record.overdue], ['open', 'missing', true])
})

test('only the last hour counts, so every page window gives the same answer', () => {
  const day = seq('SFFF' + 'S'.repeat(200))
  assert.deepEqual(state(day), state(day.filter((c) => c.timestamp > NOW - 3_600_000)))
  assert.equal(state(day).stage, 'healthy')
})

test('not monitored, waiting, or no checks in the last hour light nothing', () => {
  const off = state(seq('FFF'), [openRow(NOW - 600_000)], { active: false })
  assert.deepEqual([off.stage, off.blank, off.record], [null, 'off', { kind: 'stopping', since: sec(NOW - 600_000) * 1000, pass: H + 3_600_000 }])
  assert.equal(state([], [], { verdict: 'pending' }).blank, 'pending')
  const old = seq('SSS', NOW - 2 * 3_600_000)
  assert.deepEqual([state(old).stage, state(old).blank], [null, 'no_checks'])
  assert.equal(state(old, [openRow(NOW - 3 * 3_600_000)]).stage, 'open')
})

test('a time cut off at the hour\'s edge says so, and drops a duration it cannot know', () => {
  const longOutage = state(seq('S' + 'F'.repeat(70)))
  assert.deepEqual([longOutage.stage, longOutage.record.kind, longOutage.cut], ['open', 'missing', true])
  const backLongAgo = state(seq('S'.repeat(61)), [openRow(NOW - 3 * 3_600_000)])
  assert.deepEqual([backLongAgo.stage, backLongAgo.cut, backLongAgo.downFor], ['recovering', true, null])
  assert.equal(state(seq('SFFF')).cut, false)
})

test('failures after the check that passed end Recovering', () => {
  const checks = seq('FFFSFFI')
  for (const incidents of [[], [openRow(checks[0].timestamp)]]) {
    const s = state(checks, incidents)
    assert.deepEqual([s.stage, s.blank, s.reset], [null, 'no_evidence', 2])
  }
  assert.equal(state(seq('FFFSI'), [openRow(seq('FFFSI')[0].timestamp)]).stage, 'recovering')
})

test('a record still closing turns overdue exactly 10 minutes after its pass', () => {
  const checks = seq('FFFS', H + 50 * 60_000) // passed at H+50 min, so the pass at H+60 min closes it
  const rows = [openRow(checks[0].timestamp)]
  const at = (now) => state(checks, rows, { now }).record
  assert.deepEqual(at(H + 70 * 60_000), { kind: 'closing', since: checks[0].timestamp, pass: H + 3_600_000, overdue: false })
  assert.equal(at(H + 70 * 60_000 + 1).overdue, true)
})

test('a legacy row that starts after the first failure still covers its run', () => {
  const down = seq('SFFFFF')
  assert.deepEqual([state(down, [openRow(down[3].timestamp)]).stage, state(down, [openRow(down[3].timestamp)]).record.kind], ['open', 'open'])
  const back = seq('SFFFFFS')
  const s = state(back, [openRow(back[3].timestamp)])
  assert.deepEqual([s.stage, s.record.kind], ['recovering', 'closing'])
})

test('threshold 1: one failure is an incident, and there is no Suspect', () => {
  assert.equal(state(seq('SF'), [], { threshold: 1 }).stage, 'open')
  assert.equal(state(seq('FS'), [], { threshold: 1 }).stage, 'recovering')
  assert.equal(state(seq('SS'), [], { threshold: 1 }).stage, 'healthy')
})

test('a paused endpoint: nothing on record, or an outage that had already ended', () => {
  assert.deepEqual(state(seq('SSS'), [], { active: false }).record, { kind: 'none' })
  const checks = seq('FFFS')
  const s = state(checks, [openRow(checks[0].timestamp)], { active: false })
  assert.deepEqual([s.blank, s.record.kind], ['off', 'closing']) // the pass closes it as a recovery, not as monitoring stopped
})

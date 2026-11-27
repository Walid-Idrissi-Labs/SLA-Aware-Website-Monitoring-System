import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveEvents, fmtMs, passQueue, runOffset, runSlots, stagesOf } from '../src/lib/pipeline.ts'

const MIN = 60_000
const HOUR = 3_600_000
// 13:25:00 UTC: the last pass ran at 13:00, the next is at 14:00.
const NOW = Date.UTC(2026, 10, 27, 13, 25)
const STATUS = { S: 'success', F: 'failure', I: 'inconclusive' }

/** One check per minute, the last one landing 20 s before now; `_` is a minute with no check. */
function seq(pattern, { end = NOW - 20_000, traced = true } = {}) {
  const out = []
  ;[...pattern].forEach((ch, i, all) => {
    if (ch === '_') return
    const timestamp = end - (all.length - 1 - i) * MIN
    const check = {
      timestamp,
      status: STATUS[ch],
      latency_ms: 100,
      http_status_code: ch === 'S' ? 200 : 503,
    }
    if (traced)
      Object.assign(check, {
        run_started_at: timestamp - 130,
        probe_started_at: timestamp - 100,
        write_started_at: timestamp + 40,
      })
    out.push(check)
  })
  return out
}

const project = (id, checks, extra = {}) => ({
  project_id: id,
  name: id,
  url: `https://${id}.example`,
  active: true,
  failure_threshold: 3,
  thresholds: { min_uptime_pct: 99.9, max_avg_latency_ms: 300 },
  notification_email: 'x@example.com',
  created_at: '2026-01-01T00:00:00Z',
  status: {
    project_id: id,
    current_status: checks.at(-1)?.status ?? 'unknown',
    checks,
  },
  ...extra,
})

const events = (pattern, extra) =>
  deriveEvents([project('a', seq(pattern), extra)], NOW)
    .reverse()
    .map((e) => e.kind)

test('stages come from the three stamps, and an older row has none', () => {
  const [check] = seq('S')
  assert.deepEqual(stagesOf(check), {
    startup: 30,
    probe: 100,
    hold: 40,
    total: 170,
  })
  const { run_started_at, probe_started_at, write_started_at, ...old } = check
  assert.equal(stagesOf(old), null)
  // Wall-clock stamps can step backwards: a stage never goes below zero.
  assert.equal(stagesOf({ ...check, write_started_at: check.timestamp - 5 }).hold, 0)
})

test('runs fill one slot per minute, ending at the newest run', () => {
  const slots = runSlots([project('a', seq('SSF_S')), project('b', seq('SSSSS'))], NOW)
  assert.equal(slots.length, 60) // runs at :39.87, so the hour's oldest minute is inside the window
  const last = slots.at(-1)
  assert.equal(last.minute, Math.floor((NOW - 20_000 - 130) / MIN))
  assert.equal(last.rows.length, 2)
  assert.equal(slots.at(-2).rows.length, 1) // a's gap: 1 of 2 stored
  assert.equal(slots.at(-2).expected, 2)
  assert.deepEqual([slots.at(-3).up, slots.at(-3).down, slots.at(-3).none], [1, 1, 0])
  assert.equal(last.duration, 170) // run start to the last write
  assert.equal(slots[0].rows.length, 0)
})

test('a minute whose run fell before the window opened is left out, not shown as missing', () => {
  // Runs at :20; at 13:25:25 the 13:25 run is not stored yet, and the window opened at 12:25:25,
  // after the 12:25 run: that minute is outside what the API returned.
  const now = Date.UTC(2026, 10, 27, 13, 25, 25)
  const checks = seq('S'.repeat(61), {
    end: Date.UTC(2026, 10, 27, 13, 24, 20, 200),
  })
  const slots = runSlots([project('a', checks)], now)
  assert.equal(slots.length, 59)
  assert.ok(slots.every((s) => s.rows.length === 1))
})

test('an older row groups by its probe end and has no run duration', () => {
  const slots = runSlots([project('a', seq('SS', { traced: false }))], NOW)
  assert.equal(slots.at(-1).rows.length, 1)
  assert.equal(slots.at(-1).duration, null)
})

test('two run starts in one minute read as two runs', () => {
  const [one] = seq('S')
  const two = {
    ...one,
    timestamp: one.timestamp + 5_000,
    run_started_at: one.run_started_at + 5_000,
    write_started_at: one.write_started_at + 5_000,
  }
  const slots = runSlots([project('a', [one]), project('b', [two])], NOW)
  assert.equal(slots.at(-1).runs, 2)
})

test('an endpoint created later is not expected in earlier runs', () => {
  const created = new Date(NOW - 3 * MIN).toISOString()
  const slots = runSlots([project('a', seq('SSSSS')), project('b', seq('SS'), { created_at: created })], NOW)
  assert.deepEqual(
    slots.slice(-5).map((s) => s.expected),
    [1, 1, 1, 2, 2],
  )
})

test('paused endpoints are left out', () => {
  const slots = runSlots([project('a', seq('SS')), project('b', seq('SS'), { active: false })], NOW)
  assert.equal(slots.at(-1).rows.length, 1)
  assert.equal(slots.at(-1).expected, 1)
})

test('the run offset is the median second within the minute', () => {
  const offset = runOffset([project('a', seq('SSS'))], NOW)
  assert.deepEqual(offset, { ms: (NOW - 20_000 - 130) % MIN, stamped: true })
  assert.equal(runOffset([], NOW), null)
})

test('a healthy endpoint says nothing', () => {
  assert.deepEqual(events('SSSSSSSSSS'), [])
})

test('a short blip counts up to the threshold and recovers below it', () => {
  assert.deepEqual(events('SFFS'), ['failing', 'failing', 'recovered'])
})

test('an outage meets the down rule once, folds, and meets the recovery rule', () => {
  assert.deepEqual(events('SFFFFFFS'), ['failing', 'failing', 'down', 'up'])
  assert.deepEqual(events('SFFFFF'), ['failing', 'failing', 'down', 'still'])
})

test('a check without a verdict breaks the down rule but not the recovery rule', () => {
  // Board #30: the down rule is met once per outage; a check without a verdict doesn't re-arm it.
  assert.deepEqual(events('SFFFIFFF'), ['failing', 'failing', 'down', 'noevidence', 'still'])
  // The first run of three after a broken one still meets it.
  assert.deepEqual(events('SFFIFFF'), ['failing', 'failing', 'noevidence', 'down'])
  // Three failures, never three in a row: no down alert, so no recovery alert either.
  assert.deepEqual(events('SFFIFS'), ['failing', 'failing', 'noevidence', 'recovered'])
  assert.match(deriveEvents([project('a', seq('SFFIFS'))], NOW)[0].text, /never 3 in a row/)
  // Two failures, a blocked probe, a pass: still short of the threshold.
  assert.deepEqual(events('SFFIS'), ['failing', 'failing', 'noevidence', 'recovered'])
  // Three failures before the blocked probe: the recovery rule counts past it.
  const list = deriveEvents([project('a', seq('SFFFIS'))], NOW)
  assert.match(list[0].text, /after 3 failures: the recovery alert rule is met/)
})

test('a run already going when the window opens is not counted from its middle', () => {
  assert.deepEqual(events('FFFF'), ['still'])
  assert.deepEqual(events('FFS'), ['recovered'])
  const list = deriveEvents([project('a', seq('FFFFS'))], NOW)
  assert.match(list[0].text, /after at least 4 failures: the recovery alert rule is met/)
  // Failures before the window may count toward the recovery rule, so no threshold claim either way.
  for (const pattern of ['FFIS', 'IFFS']) assert.equal(deriveEvents([project('a', seq(pattern))], NOW)[0].text, 'Back up after at least 2 failures.')
})

test('a new endpoint starts counting at its first check', () => {
  const created = new Date(NOW - 20_000 - 3 * MIN - 30_000).toISOString()
  assert.deepEqual(events('FFFF', { created_at: created }), ['first', 'failing', 'failing', 'down', 'still'])
})

test('missing minutes and runs of no verdict fold into one line each', () => {
  const list = deriveEvents([project('a', seq('SS___SIIIS'))], NOW).reverse()
  assert.deepEqual(
    list.map((e) => e.kind),
    ['gap', 'noevidence'],
  )
  assert.equal(list[0].text, 'No check for 3 minutes.')
  assert.equal(list[1].text, 'No verdict for 3 checks in a row.')
  // The window cut that run of no verdicts, so it may be longer.
  assert.equal(deriveEvents([project('a', seq('IIIS'))], NOW)[0].text, 'No verdict for at least 3 checks in a row.')
})

test('a check the monitor refused to make says why', () => {
  const checks = seq('SI').map((c) => (c.status === 'inconclusive' ? { ...c, error_type: 'private', http_status_code: 0 } : c))
  assert.equal(deriveEvents([project('a', checks)], NOW)[0].text, "No verdict: the address isn't public.")
})

test('events come newest first', () => {
  const list = deriveEvents([project('a', seq('SFFSFFS')), project('b', seq('SFS'))], NOW)
  assert.equal(list.length, 8)
  assert.ok(list.every((e, i) => i === 0 || list[i - 1].at >= e.at))
})

test('an endpoint that went quiet says so', () => {
  const quiet = seq('SSS', { end: NOW - 10 * MIN })
  assert.deepEqual(deriveEvents([project('a', quiet)], NOW).map((e) => e.text), ['No check since 13:15 UTC.'])
  const [silent] = deriveEvents([project('a', [])], NOW)
  assert.deepEqual([silent.text, silent.undated], ['No check in the last hour.', true]) // its time is only the window's edge
  // Not one created a moment ago, whose first check is still due.
  assert.deepEqual(deriveEvents([project('a', [], { created_at: new Date(NOW - 30_000).toISOString() })], NOW), [])
})

test('a monitor that stopped leaves its silent minutes in the strip', () => {
  const slots = runSlots([project('a', seq('S'.repeat(30), { end: NOW - 30 * MIN }))], NOW)
  assert.equal(slots.at(-1).rows.length, 0)
  assert.equal(slots.filter((s) => s.rows.length).length, 30)
  assert.ok(slots.length >= 59)
})

test('the next pass opens what reached the threshold since the last one, and closes what recovered', () => {
  // 25 checks, 13:00:40 to 13:24:40: three failures from 13:10:40.
  const reachedAfter = 'S'.repeat(10) + 'FFF' + 'S'.repeat(12)
  assert.deepEqual(passQueue([project('a', seq(reachedAfter))], NOW), {
    open: 1,
    close: 0,
  })
  // From 12:55:40: the third failure at 12:58:40 was on record after the 13:00 pass, and the
  // first passing check, at 13:02:40 past two without a verdict, is what the 14:00 pass closes it at.
  const recordedThenRecovered = 'S' + 'FFFF' + 'II' + 'S'.repeat(23)
  assert.deepEqual(passQueue([project('a', seq(recordedThenRecovered))], NOW), {
    open: 0,
    close: 1,
  })
  // From 12:55:40, failing since 12:56:40: on record since the 13:00 pass, and nothing has passed since.
  const stillDown = 'S' + 'F'.repeat(29)
  assert.deepEqual(passQueue([project('a', seq(stillDown))], NOW), {
    open: 0,
    close: 0,
  })
  // A check without a verdict splits the run, not the incident: the processor opens one.
  assert.deepEqual(passQueue([project('a', seq('S'.repeat(10) + 'FFFIFFF' + 'S'.repeat(8)))], NOW), { open: 1, close: 0 })
  // An outage already going an hour ago is not new, even when the window's own third failure lands after the pass.
  assert.deepEqual(passQueue([project('a', seq('F'.repeat(60)))], NOW), { open: 0, close: 0 })
})

test('durations read in ms, then seconds', () => {
  assert.equal(fmtMs(312.4), '312\u00a0ms')
  assert.equal(fmtMs(1_234), '1.23\u00a0s')
  assert.equal(fmtMs(10_340), '10.3\u00a0s')
})

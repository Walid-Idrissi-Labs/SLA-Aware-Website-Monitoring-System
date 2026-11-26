// A UTC day's verdict (lib/format.ts dayVerdict). Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayVerdict } from '../src/lib/format.ts'

const NOW = Date.parse('2026-11-25T12:00:00Z') // noon on "today"
const CREATED = '2026-10-01T09:30:00.000000+00:00'
const SINCE = '2026-11-10'
const day = (date, fields = {}) => ({ date, up: 0, down: 0, inconclusive: 0, outage_sec: 0, ...fields })
const judge = (d, since = SINCE, created = CREATED) => dayVerdict(d, since, created, NOW)

test('a confirmed outage outranks everything, even an untracked day', () => {
  assert.equal(judge(day('2026-11-20', { up: 1400, outage_sec: 300 })).verdict, 'outage')
  assert.equal(judge(day('2026-11-01', { outage_sec: 60 })).verdict, 'outage')
})

test('before tracking began, or before the monitor existed, a day is untracked', () => {
  assert.equal(judge(day('2026-11-09')).verdict, 'untracked')
  assert.equal(judge(day('2026-11-20', { up: 1400 }), null).verdict, 'untracked')
  assert.equal(judge(day('2026-09-30'), '2026-09-01').verdict, 'untracked')
})

test('a tracked day needs conclusive checks to be operational', () => {
  assert.equal(judge(day('2026-11-20', { inconclusive: 1400 })).verdict, 'no_data')
  assert.equal(judge(day('2026-11-20', { up: 1430, down: 10 })).verdict, 'operational')
  assert.equal(judge(day('2026-11-20', { up: 1430, down: 10 })).uptime.toFixed(2), '99.31')
})

test('a full past day with under half its expected checks is thin', () => {
  assert.equal(judge(day('2026-11-20', { up: 700 })).thin, true)
  assert.equal(judge(day('2026-11-20', { up: 1400 })).thin, false)
})

test('the first tracked day of an older monitor has no denominator', () => {
  assert.equal(judge(day('2026-11-10', { up: 360 })).expected, null)
  assert.equal(judge(day('2026-11-10', { up: 360 }), '2026-11-10', '2026-11-10T09:30:00Z').expected, 870)
})

test('today, the creation day and the first tracked day are partial, never thin', () => {
  const today = judge(day('2026-11-25', { up: 100 }))
  assert.equal(today.partial, true)
  assert.equal(today.expected, 720) // minutes since midnight
  assert.equal(today.thin, false)
  assert.equal(judge(day('2026-11-10', { up: 60 })).thin, false) // first tracked day
  assert.equal(judge(day('2026-10-01', { up: 300 }), '2026-09-01').thin, false) // created at 09:30
  assert.equal(judge(day('2026-10-01', { up: 300 }), '2026-09-01').expected, 870)
})

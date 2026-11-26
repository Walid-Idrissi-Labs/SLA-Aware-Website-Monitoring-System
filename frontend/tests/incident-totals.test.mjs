// Incident totals for a window (lib/format.ts incidentTotals). Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { incidentTotals } from '../src/lib/format.ts'

const NOW = 1_800_000_000
const DAY = 86_400
const FROM = NOW - 7 * DAY
const closed = (start, end, extra = {}) => ({ start_time: start, end_time: end, duration_seconds: end - start, resolved: true, ...extra })
const open = (start) => ({ start_time: start, end_time: null, duration_seconds: null, resolved: false })
const totals = (incidents) => incidentTotals(incidents, FROM, NOW + 1, NOW)

test('an incident inside the window counts whole', () => {
  const t = totals([closed(NOW - DAY, NOW - DAY + 300)])
  assert.deepEqual([t.count, t.downtime, t.longest, t.mttr], [1, 300, 300, 300])
})

test('an outage that began before the window counts only its part inside it', () => {
  const t = totals([open(NOW - 40 * DAY)])
  assert.deepEqual([t.count, t.downtime], [1, 7 * DAY])
  const ended = totals([closed(NOW - 10 * DAY, NOW - 6 * DAY)])
  assert.deepEqual([ended.count, ended.downtime, ended.mttr], [1, DAY, 4 * DAY]) // MTTR keeps the whole repair
})

test('an incident spanning the previous and current windows splits its downtime between them', () => {
  const spanning = [closed(NOW - 8 * DAY, NOW - 6 * DAY)]
  const current = totals(spanning)
  const previous = incidentTotals(spanning, FROM - 7 * DAY, FROM, NOW)
  assert.deepEqual([current.count, current.downtime, previous.count, previous.downtime], [1, DAY, 1, DAY])
})

test('one that ended before the window stays out, and only failures inside it set MTBF', () => {
  assert.equal(totals([closed(NOW - 10 * DAY, NOW - 9 * DAY)]).count, 0)
  const t = totals([open(NOW - 40 * DAY), closed(NOW - 3 * DAY, NOW - 3 * DAY + 60), closed(NOW - DAY, NOW - DAY + 60)])
  assert.equal(t.mtbf, 2 * DAY)
})

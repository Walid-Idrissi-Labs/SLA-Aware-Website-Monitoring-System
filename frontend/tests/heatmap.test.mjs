// Day × hour heatmap layout and latency ramp (lib/format.ts). Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hourGrid, latencyColor, LATENCY_LEVELS } from '../src/lib/format.ts'

const H = 3_600_000
const at = (iso) => Date.parse(iso)

test('a 72h window touches four UTC dates, each a full row of 24 hours', () => {
  const now = at('2026-11-25T14:30:00Z')
  const rows = hourGrid([], now - 72 * H, now)
  assert.deepEqual(rows.map((r) => r.date), ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25'])
  assert.ok(rows.every((r) => r.cells.length === 24))
})

test('only hours overlapping the window are in it, partial ends included', () => {
  const now = at('2026-11-25T14:30:00Z')
  const [first, , , last] = hourGrid([], now - 72 * H, now)
  assert.equal(first.cells[13].inWindow, false) // ended before the window opened at 14:30
  assert.equal(first.cells[14].inWindow, true) // the partial first hour
  assert.equal(last.cells[14].inWindow, true) // the current hour, still filling
  assert.equal(last.cells[15].inWindow, false) // the future
})

test('a bucket lands in the cell of its UTC hour', () => {
  const now = at('2026-11-25T14:30:00Z')
  const bucket = { key: String(at('2026-11-25T09:00:00Z')), p50: 120 }
  const rows = hourGrid([bucket], now - 24 * H, now)
  assert.equal(rows.at(-1).cells[9].bucket, bucket)
  assert.equal(rows.at(-1).cells[10].bucket, null)
})

test('the latency ramp is relative to the target and never red', () => {
  assert.equal(latencyColor(150, 300), LATENCY_LEVELS[0].color)
  assert.equal(latencyColor(300, 300), LATENCY_LEVELS[1].color)
  assert.equal(latencyColor(450, 300), LATENCY_LEVELS[2].color)
  assert.equal(latencyColor(10_000, 300), LATENCY_LEVELS[3].color)
  assert.ok(!LATENCY_LEVELS.some((l) => l.color === '#f87171'))
})

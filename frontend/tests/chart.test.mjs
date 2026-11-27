// The shared curve (lib/chart.ts smoothPath). Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { smoothPath } from '../src/lib/chart.ts'

// SVG y grows downwards, so a chart's floor (0m of downtime) is its largest y.
const FLOOR = 100
const FLAT_THEN_RISE = [[0, FLOOR], [10, FLOOR], [20, FLOOR], [30, FLOOR], [40, 20]]
const ys = (d) => [...d.matchAll(/-?\d+\.\d+ (-?\d+\.\d+)/g)].map((m) => Number(m[1]))

test('clamped, the curve never dips below its floor before a rise', () => {
  assert.ok(Math.max(...ys(smoothPath(FLAT_THEN_RISE, true))) <= FLOOR)
})

test('unclamped, the output is unchanged for the charts that did not ask for the clamp', () => {
  assert.equal(
    smoothPath(FLAT_THEN_RISE),
    'M 0.00 100.00 C 1.67 100.00, 6.67 100.00, 10.00 100.00 C 13.33 100.00, 16.67 100.00, 20.00 100.00 C 23.33 100.00, 26.67 113.33, 30.00 100.00 C 33.33 86.67, 38.33 33.33, 40.00 20.00',
  )
})

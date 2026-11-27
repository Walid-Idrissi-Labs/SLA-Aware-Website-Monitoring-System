// A report's shown figures (lib/format.ts reportFigures), mirroring report_generator templates.py. Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reportFigures } from '../src/lib/format.ts'

const report = (fields) => ({ uptime_pct: 0, avg_latency_ms: 0, p95_latency_ms: 0, ...fields })

test('no conclusive check: no uptime and no latency', () => {
  assert.deepEqual(reportFigures(report({ checks_up: 0, checks_down: 0 })), { uptime: null, avg: null, p95: null })
})

test('only failures: a real 0% uptime, but no latency sample', () => {
  assert.deepEqual(reportFigures(report({ checks_up: 0, checks_down: 60 })), { uptime: 0, avg: null, p95: null })
})

test('measured and legacy rows keep their figures', () => {
  assert.deepEqual(reportFigures(report({ checks_up: 50, checks_down: 2, uptime_pct: 96.15, avg_latency_ms: 140, p95_latency_ms: 210 })), { uptime: 96.15, avg: 140, p95: 210 })
  assert.deepEqual(reportFigures(report({ uptime_pct: 99.9, avg_latency_ms: 120, p95_latency_ms: 180 })), { uptime: 99.9, avg: 120, p95: 180 })
})

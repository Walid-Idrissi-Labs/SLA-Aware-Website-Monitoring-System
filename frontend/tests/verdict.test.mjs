// A monitor's verdict precedence (lib/format.ts verdictFor). Run with `npm test`:
// Node's built-in runner strips the TypeScript types (Node 22.18+), so it needs no dependencies.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verdictFor, STALE_AFTER_MS } from '../src/lib/format.ts'

const NOW = Date.parse('2026-11-25T12:00:00Z')
const FRESH = NOW - 30_000
const OLD = NOW - STALE_AFTER_MS - 1
const CREATED = '2026-11-01T00:00:00.000000+00:00'
const monitor = (fields) => verdictFor({ active: true, created_at: CREATED, ...fields }, NOW)

test('the threshold is max(2 x interval, interval + timeout + 60 s)', () => {
  assert.equal(STALE_AFTER_MS, 130_000)
})

test('a fresh check speaks for itself', () => {
  assert.equal(monitor({ current_status: 'success', last_checked_at: FRESH }), 'up')
  assert.equal(monitor({ current_status: 'failure', last_checked_at: FRESH }), 'down')
  assert.equal(monitor({ current_status: 'inconclusive', last_checked_at: FRESH }), 'inconclusive')
  assert.equal(monitor({ current_status: 'success', last_checked_at: NOW - STALE_AFTER_MS }), 'up')
})

test('an old check is stale, whatever it said', () => {
  for (const status of ['success', 'failure', 'inconclusive']) {
    assert.equal(monitor({ current_status: status, last_checked_at: OLD }), 'stale')
  }
})

test('stale outranks an open incident while the monitor is active', () => {
  assert.equal(monitor({ current_status: 'failure', last_checked_at: OLD, open_incident: true }), 'stale')
})

test('no check yet: pending until the first one was due, then stale', () => {
  assert.equal(monitor({ created_at: new Date(NOW - 20_000).toISOString(), last_checked_at: null }), 'pending')
  assert.equal(monitor({ last_checked_at: null }), 'stale')
  assert.equal(monitor({ created_at: 'not a date', last_checked_at: null }), 'pending')
})

test('inactive is off, unless it left an incident open', () => {
  assert.equal(monitor({ active: false, current_status: 'success', last_checked_at: FRESH }), 'off')
  assert.equal(monitor({ active: false, last_checked_at: null }), 'off')
  assert.equal(monitor({ active: false, current_status: 'failure', last_checked_at: OLD, open_incident: true }), 'down')
})

// What the Google sign-in callback tells a person when it fails (src/lib/callbackError.ts). Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeCallbackError } from '../src/lib/callbackError.ts'

test('a cancelled Google sign-in reads as cancelled, with a retry', () => {
  const m = describeCallbackError({ kind: 'provider', error: 'access_denied', description: 'User cancelled the login' })
  assert.equal(m.title, 'Sign-in cancelled')
  assert.equal(m.retry, true)
  assert.equal(m.details, 'access_denied: User cancelled the login')
})

test('raw provider errors never reach the body, only the details', () => {
  for (const error of ['invalid_request', 'redirect_mismatch', 'unauthorized_client', 'server_error']) {
    const m = describeCallbackError({ kind: 'provider', error, description: 'Already found an entry for username google_1234' })
    assert.ok(!m.body.includes(error) && !m.body.includes('google_1234'), `${error} leaked into the body`)
    assert.ok(m.details?.startsWith(error))
  }
})

test('every failure has a title and a sentence, and only a direct visit offers no retry', () => {
  const all = [
    { kind: 'provider', error: 'access_denied' },
    { kind: 'no_code' },
    { kind: 'no_verifier' },
    { kind: 'state_mismatch' },
    { kind: 'exchange_rejected', status: 400, body: '{"error":"invalid_grant"}' },
    { kind: 'network' },
  ]
  for (const f of all) {
    const m = describeCallbackError(f)
    assert.ok(m.title && m.body.endsWith('.'), f.kind)
    assert.equal(m.retry, f.kind !== 'no_code', f.kind)
  }
})

test('details are capped, and a stopped flow says why', () => {
  assert.ok(describeCallbackError({ kind: 'exchange_rejected', status: 400, body: 'x'.repeat(500) }).details.length <= 201)
  assert.equal(describeCallbackError({ kind: 'state_mismatch' }).title, 'Sign-in stopped')
})

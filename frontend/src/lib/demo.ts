import type { User } from '../types'

/**
 * Demo mode (board #11): the app under /demo, running on the hand-written
 * dataset in src/demo, with no account, no API and no Cognito. The URL is the
 * switch, read once at load, so a signed-in tab and a demo tab never mix, and
 * nothing about the demo is ever written to storage.
 */
export const DEMO = typeof location !== 'undefined' && /^\/demo(\/|$)/.test(location.pathname)

/** The visitor the demo signs in as; a Settings save edits it for the visit. */
export const DEMO_USER: User = {
  user_id: 'demo',
  email: 'demo@example.com',
  display_name: 'Demo visitor',
  notification_email: 'demo@example.com',
  created_at: '2026-01-05T09:00:00Z',
}

/** Leave the demo for the real app: a full load, since the router's base path changes. */
export function exitDemo(): void {
  window.location.assign('/login')
}

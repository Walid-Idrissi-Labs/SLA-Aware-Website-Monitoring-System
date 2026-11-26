import type { Project } from '../types'
import { DEMO_USER } from '../lib/demo'
import { STORIES, demoIncidents, demoProject, demoProjects, demoReports, demoStatus } from './data'

/**
 * The demo's stand-in for the API (board #11): lib/api.ts sends every request
 * here in demo mode, through a dynamic import, so neither this nor the dataset
 * ships in the real app's bundle. Same routes, shapes and limits as
 * sla-monitor-terraform/lambda_src/api/handler.py; nothing leaves the browser.
 */

/** The visitor's arrival: the stories hang off this hour for the whole visit. */
const anchor = Date.now()

/** An integer query parameter, clamped like the API's. */
function param(value: string | null, fallback: number, lo: number, hi: number): number {
  const n = Number(value ?? fallback)
  if (!Number.isInteger(n)) throw new Error(`Expected an integer, got "${value}"`)
  return Math.min(Math.max(n, lo), hi)
}

/** Only what GET /projects carries, so the demo cannot hide a page that leans on more. */
function listItem(p: Project): Project {
  const { project_id, name, url, active, created_at, current_status, last_latency_ms, last_checked_at, status } = p
  return { project_id, name, url, active, created_at, current_status, last_latency_ms, last_checked_at, ...(status ? { status } : {}) } as Project
}

export async function handle<T>(method: string, path: string, _body?: unknown): Promise<T> {
  const url = new URL(path, 'https://demo.invalid')
  const now = Date.now()
  const [root, id, sub] = url.pathname.split('/').filter(Boolean)

  if (method === 'GET') {
    if (url.pathname === '/me') return DEMO_USER as T
    if (url.pathname === '/projects') {
      const hours = url.searchParams.get('include') === 'status' ? param(url.searchParams.get('hours'), 24, 1, 72) : undefined
      return demoProjects(now, hours, anchor).map(listItem) as T
    }
    if (root === 'projects' && id) {
      // The API answers 403 for a project that is not yours, so an unknown id reads the same.
      if (!STORIES.some((s) => s.id === id)) throw new Error('Forbidden')
      if (!sub) return demoProject(id, now, anchor) as T
      if (sub === 'status') return demoStatus(id, param(url.searchParams.get('hours'), 24, 1, 72), now, 30, anchor) as T
      if (sub === 'reports') return demoReports(id, now, anchor) as T
      if (sub === 'incidents') return demoIncidents(id, param(url.searchParams.get('days'), 30, 1, 365), now, anchor) as T
    }
  }
  throw new Error('Not available in the demo yet')
}

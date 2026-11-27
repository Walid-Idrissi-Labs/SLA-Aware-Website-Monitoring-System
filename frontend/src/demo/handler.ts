import type { Project, ProjectReport, User } from '../types'
import { DEMO_USER } from '../lib/demo.ts'
import { MAX_ACTIVE_PROJECTS } from '../lib/format.ts'
import {
  type DemoFields,
  addDemoEndpoint,
  demoExists,
  demoIncidents,
  demoProject,
  demoProjects,
  demoReport,
  demoReports,
  demoStatus,
  editDemoEndpoint,
} from './data.ts'

/**
 * The demo's stand-in for the API (board #11): lib/api.ts sends every request
 * here in demo mode, through a dynamic import, so neither this nor the dataset
 * ships in the real app's bundle. Same routes, shapes, rules and messages as
 * sla-monitor-terraform/lambda_src/api/handler.py and project_manager/handler.py.
 * Writes last for the visit: nothing leaves the browser, and a reload resets them.
 */

/** The visitor's arrival: the stories hang off this hour for the whole visit. */
const anchor = Date.now()

/** On-demand reports the visitor generated, per endpoint. */
const generated = new Map<string, ProjectReport[]>()

/** The one sample report every HTML download opens: rendered by the real template (scripts/build-demo-report.py). */
const SAMPLE_REPORT = '/demo/sample-report.html'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const SPEC_RE = /^\d{3}(-\d{3})?(,\d{3}(-\d{3})?)*$/

/** An integer query parameter, clamped like the API's; anything Python's int() rejects is a 400 there. */
function param(name: string, value: string | null, fallback: number, lo: number, hi: number): number {
  if (value != null && !/^\s*[-+]?\d+\s*$/.test(value)) throw new Error(`${name} must be an integer`)
  return Math.min(Math.max(value == null ? fallback : Number(value), lo), hi)
}

/** Only what GET /projects carries, so the demo cannot hide a page that leans on more. */
function listItem(p: Project): Project {
  const { project_id, name, url, active, created_at, current_status, last_latency_ms, last_checked_at, status } = p
  return { project_id, name, url, active, created_at, current_status, last_latency_ms, last_checked_at, ...(status ? { status } : {}) } as Project
}

/** The project manager's validate_accepted_status: '200-399, 404' becomes '200-399,404', or null. */
function acceptedStatus(spec: unknown): string | null {
  if (typeof spec !== 'string' || !spec.trim() || spec.length > 200) return null
  const compact = spec.split(',').map((part) => part.trim()).join(',')
  if (!SPEC_RE.test(compact)) return null
  for (const part of compact.split(',')) {
    const [low, high = low] = part.split('-').map(Number)
    if (low < 100 || high > 599 || low > high) return null
  }
  return compact
}

/** IPv4 ranges Python's ipaddress counts as not global (3.12), plus multicast: the monitor's is_public. */
const NOT_PUBLIC: [number, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([base, bits]) => [toNumber(base as string), bits as number])

function toNumber(dotted: string): number {
  return dotted.split('.').reduce((n, part) => n * 256 + Number(part), 0)
}

function isPublicIPv4(dotted: string): boolean {
  const n = toNumber(dotted)
  // 192.0.0.9 and 192.0.0.10 are the registry's exceptions inside 192.0.0.0/24.
  if (n === toNumber('192.0.0.9') || n === toNumber('192.0.0.10')) return true
  return !NOT_PUBLIC.some(([base, bits]) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(base / 2 ** (32 - bits)))
}

/** The project manager's url_problem: syntax only, no DNS, the same messages. */
function urlProblem(url: string): string | null {
  let parts: URL
  try {
    parts = new URL(url)
  } catch {
    return 'url must be a valid http:// or https:// address'
  }
  if (parts.username || parts.password) return 'url must not contain a username or password'
  const host = parts.hostname.replace(/\.$/, '')
  if (!host) return 'url must be a valid http:// or https:// address'
  if (host.startsWith('[')) return 'url must use a hostname or an IPv4 address'
  if (host === 'localhost' || host.endsWith('.localhost')) return 'url must point to a public address'
  // The URL parser has already rewritten 127.1, 0x7f.1 and 2130706433 as 127.0.0.1.
  return /^\d+\.\d+\.\d+\.\d+$/.test(host) && !isPublicIPv4(host) ? 'url must point to a public address' : null
}

/** The project manager's validate_project_fields: the same fields, rules and messages. */
function validate(body: Record<string, unknown>): DemoFields {
  const clean: DemoFields = {}
  if ('name' in body) {
    const name = body.name
    if (typeof name !== 'string' || !name.trim()) throw new Error('name must be a non-empty string')
    if (name.length > 200) throw new Error('name must be 200 characters or fewer')
    clean.name = name.trim()
  }
  if ('url' in body) {
    const url = body.url
    if (typeof url !== 'string' || !/^https?:\/\/\S+$/i.test(url)) throw new Error('url must start with http:// or https://')
    if (url.length > 2048) throw new Error('url must be 2048 characters or fewer')
    const problem = urlProblem(url.trim())
    if (problem) throw new Error(problem)
    clean.url = url.trim()
  }
  if ('failure_threshold' in body) {
    const threshold = body.failure_threshold
    if (typeof threshold !== 'number' || !Number.isInteger(threshold) || threshold < 1 || threshold > 10) {
      throw new Error('failure_threshold must be an integer between 1 and 10')
    }
    clean.failure_threshold = threshold
  }
  if ('active' in body) {
    if (typeof body.active !== 'boolean') throw new Error('active must be a boolean')
    clean.active = body.active
  }
  if ('notification_email' in body) {
    const email = body.notification_email
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
      throw new Error('notification_email must be a valid email address')
    }
    clean.notification_email = email.trim()
  }
  if ('accepted_status' in body) {
    const spec = acceptedStatus(body.accepted_status)
    if (!spec) {
      throw new Error('accepted_status must be a status list like "200-399" or "200-399,404" (codes 100-599, ranges low to high)')
    }
    clean.accepted_status = spec
  }
  if ('thresholds' in body) {
    const t = body.thresholds as Record<string, unknown> | null
    if (!t || typeof t !== 'object') throw new Error('thresholds must be an object')
    const { min_uptime_pct: uptime, max_avg_latency_ms: latency } = t
    if (typeof uptime !== 'number' || uptime < 0 || uptime > 100) throw new Error('thresholds.min_uptime_pct must be a number between 0 and 100')
    if (typeof latency !== 'number' || latency <= 0) throw new Error('thresholds.max_avg_latency_ms must be a positive number')
    clean.thresholds = { min_uptime_pct: uptime, max_avg_latency_ms: latency }
  }
  return clean
}

export async function handle<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = new URL(path, 'https://demo.invalid')
  const now = Date.now()
  const [root, id, sub, reportId, action] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  const input = (body ?? {}) as Record<string, unknown>

  if (url.pathname === '/me') {
    if (method === 'GET' || method === 'POST') return { ...DEMO_USER } as T
    if (method === 'PUT') {
      const patch: Partial<User> = {}
      if ('display_name' in input) {
        const name = input.display_name
        if (typeof name !== 'string' || !name.trim() || name.length > 100) {
          throw new Error('display_name must be a non-empty string of 100 characters or fewer')
        }
        patch.display_name = name.trim()
      }
      if ('notification_email' in input) {
        const email = input.notification_email
        if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
          throw new Error('notification_email must be a valid email address')
        }
        patch.notification_email = email.trim()
      }
      if (!Object.keys(patch).length) throw new Error('No valid fields provided')
      Object.assign(DEMO_USER, patch) // the sidebar reads the same object
      return { ...DEMO_USER } as T
    }
  }

  if (url.pathname === '/projects') {
    if (method === 'GET') {
      // The list caps its window at 24 h (in demoProjects), like the API.
      const hours = url.searchParams.get('include') === 'status' ? param('hours', url.searchParams.get('hours'), 24, 1, 72) : undefined
      return demoProjects(now, hours, anchor).map(listItem) as T
    }
    if (method === 'POST') {
      if (!input.name || !input.url) throw new Error('name and url are required')
      const fields = validate({
        failure_threshold: 3,
        thresholds: { min_uptime_pct: 99.9, max_avg_latency_ms: 300 },
        accepted_status: '200-399',
        ...input,
        notification_email: input.notification_email || DEMO_USER.email,
      })
      if (demoProjects(now, undefined, anchor).filter((p) => p.active).length >= MAX_ACTIVE_PROJECTS)
        throw new Error(`This account is at its limit of ${MAX_ACTIVE_PROJECTS} monitored endpoints. Delete one to make room.`)
      return demoProject(addDemoEndpoint(fields, now), now, anchor) as T
    }
  }

  if (root === 'projects' && id) {
    // The API answers 403 for a project that is not yours, so an unknown id reads the same.
    if (!demoExists(id)) throw new Error('Forbidden')
    if (!sub) {
      if (method === 'GET') return demoProject(id, now, anchor) as T
      if (method === 'PUT') {
        if (!Object.keys(input).length) throw new Error('No fields provided')
        const fields = validate(input)
        if (!Object.keys(fields).length) throw new Error('No valid fields provided')
        editDemoEndpoint(id, fields, now)
        return demoProject(id, now, anchor) as T
      }
      if (method === 'DELETE') {
        editDemoEndpoint(id, { active: false }, now) // a soft delete, like the API's
        return undefined as T
      }
    }
    if (method === 'GET' && sub === 'status') return demoStatus(id, param('hours', url.searchParams.get('hours'), 24, 1, 72), now, 30, anchor) as T
    if (method === 'GET' && sub === 'incidents') return demoIncidents(id, param('days', url.searchParams.get('days'), 30, 1, 365), now, anchor) as T
    if (sub === 'reports' && !reportId) {
      if (method === 'GET') {
        // DynamoDB returns a project's reports in sort-key (report id) order.
        return [...demoReports(id, now, anchor), ...(generated.get(id) ?? [])].sort((a, b) => (a.report_id < b.report_id ? -1 : 1)) as T
      }
      if (method === 'POST') {
        const days = Number.isInteger(Number(input.days ?? 7)) ? Number(input.days ?? 7) : 7
        if (![1, 7, 30].includes(days)) throw new Error('days must be 1, 7, or 30')
        const newId = `${days}d-${new Date(now).toISOString().slice(0, 10)}`
        const report = demoReport(id, newId, now - days * 86_400_000, now, now, now, anchor)
        // Same id the same day replaces it, as the real put_item does.
        generated.set(id, [...(generated.get(id) ?? []).filter((r) => r.report_id !== newId), report])
        return { message: 'Report generated', report_id: newId, days } as T
      }
    }
    if (method === 'GET' && sub === 'reports' && reportId && action === 'download') {
      const format = (url.searchParams.get('format') ?? 'html').toLowerCase()
      if (format !== 'html' && format !== 'json') throw new Error("format must be 'html' or 'json'")
      const report = (await handle<ProjectReport[]>('GET', `/projects/${id}/reports`)).find((r) => r.report_id === reportId)
      if (!report) throw new Error('Report not found')
      if (format === 'html') return { url: SAMPLE_REPORT, expires_in: 300 } as T
      // shortcut: the JSON holds the report row's figures, not the real file's detail (daily rows, incident list, p50/p99); build those in demoReport if the JSON should match.
      const blob = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
      setTimeout(() => URL.revokeObjectURL(blob), 60_000)
      return { url: blob, expires_in: 60 } as T
    }
  }
  throw new Error('Not found')
}

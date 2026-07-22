import type { Check } from '../types'

/** Status palette — the single source for status hexes used in inline SVG/styles.
 *  Mirrors the `ok`/`warn`/`crit`/`accent` tokens in tailwind.config.js. */
export const STATUS = {
  ok: '#34d399',
  warn: '#fbbf24',
  crit: '#f87171',
  accent: '#fa5c29',
} as const

/** How often live views re-poll the API (matches the 1-minute check cadence). */
export const POLL_INTERVAL_MS = 60_000

/** Defaults applied by the backend when a project omits them. */
export const PROJECT_DEFAULTS = {
  failure_threshold: 3,
  min_uptime_pct: 99.9,
  max_avg_latency_ms: 300,
} as const

/** Epoch ms → "HH:MM:SS UTC". All SLA windows are UTC; display follows. */
export function fmtUtcTime(tsMs: number): string {
  return new Date(tsMs).toISOString().slice(11, 19) + ' UTC'
}

/** Compact "time since" label, e.g. now / 4m / 2h / 3d. */
export function timeAgo(ts: string | number | undefined): string {
  if (ts === undefined || ts === null) return '—'
  const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts
  if (Number.isNaN(ms)) return '—'
  const diff = Date.now() - ms
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/** Uptime % computed from a set of checks (success ratio). */
export function uptimeFromChecks(checks: Check[]): number | null {
  if (!checks || checks.length === 0) return null
  const ok = checks.filter((c) => c.status === 'success').length
  return (ok / checks.length) * 100
}

/** Severity → display metadata (label + tailwind-friendly hex). */
export const SEVERITY = {
  healthy: { label: 'HEALTHY', color: STATUS.ok, dim: 'rgba(52,211,153,0.14)' },
  degraded: { label: 'DEGRADED', color: STATUS.warn, dim: 'rgba(251,191,36,0.14)' },
  major: { label: 'MAJOR', color: '#fb923c', dim: 'rgba(251,146,60,0.14)' },
  critical: { label: 'CRITICAL', color: STATUS.crit, dim: 'rgba(248,113,113,0.14)' },
} as const

export type Severity = keyof typeof SEVERITY

/** Strip protocol for compact display. */
export function bareUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/** Clamp helper. */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** Seconds → compact "1h 2m" / "3m 4s" / "5s". Shared by the reports table and
 *  the incident timeline. Negative inputs are clamped to 0. */
export function formatDowntime(sec: number): string {
  const total = Math.max(0, Math.round(sec))
  if (!total) return '0s'
  if (total < 60) return `${total}s`
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

/** Failure-cause → display metadata. Colors reuse the status/severity hues. */
export const ERROR_TYPE = {
  timeout: { label: 'TIMEOUT', color: STATUS.warn },
  dns: { label: 'DNS', color: STATUS.accent },
  conn: { label: 'CONN', color: STATUS.crit },
  tls: { label: 'TLS', color: SEVERITY.major.color },
  http: { label: 'HTTP', color: STATUS.warn },
} as const

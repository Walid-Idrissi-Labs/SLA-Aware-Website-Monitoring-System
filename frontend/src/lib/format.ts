import type { Check } from '../types'

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
  healthy: { label: 'HEALTHY', color: '#34d399', dim: 'rgba(52,211,153,0.14)' },
  degraded: { label: 'DEGRADED', color: '#fbbf24', dim: 'rgba(251,191,36,0.14)' },
  major: { label: 'MAJOR', color: '#fb923c', dim: 'rgba(251,146,60,0.14)' },
  critical: { label: 'CRITICAL', color: '#f87171', dim: 'rgba(248,113,113,0.14)' },
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

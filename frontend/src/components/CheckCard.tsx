import type { ReactNode } from 'react'
import type { Check } from '../types'
import { ERROR_TYPE, STATUS, fmtUtcTime, timeAgo } from '../lib/format'
import HoverCard from './HoverCard'

const TONE = {
  success: { label: 'UP', color: STATUS.ok },
  failure: { label: 'DOWN', color: STATUS.crit },
  inconclusive: { label: 'NO EVIDENCE', color: STATUS.neutral },
} as const

/** A latency is a measurement only when the endpoint actually answered: a
 *  timeout records a synthetic value, and an inconclusive check proved nothing. */
export function measuredLatency(check: Check): number | null {
  if (check.status === 'inconclusive' || !check.http_status_code || check.error_type === 'timeout') return null
  return check.latency_ms
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-txt-lo">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono tabular-nums text-txt-hi">{children}</dd>
    </div>
  )
}

/** Hover card content for one check of the strip. */
export default function CheckCard({
  check,
  streak,
  anchor,
  leaving,
  latencyTarget,
}: {
  check: Check
  /** The same-status run ending at this check; `open` when it reaches the oldest loaded check. */
  streak: { count: number; open: boolean }
  anchor: DOMRect
  leaving: boolean
  latencyTarget?: number
}) {
  const tone = TONE[check.status] ?? TONE.inconclusive
  const latency = measuredLatency(check)
  // An HTTP error is already told by the response code, which takes its colour instead.
  const cause = check.error_type && check.error_type !== 'http' ? ERROR_TYPE[check.error_type] : null
  const ago = timeAgo(check.timestamp)
  // Capped: beyond ~100 the number reflects the selected window, not the endpoint.
  const run = streak.count > 99 ? '99+ in a row · ' : streak.count > 1 ? `${streak.count}${streak.open ? '+' : ''} in a row · ` : ''

  return (
    <HoverCard anchor={anchor} leaving={leaving}>
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 flex-none rounded-[1px]" style={{ backgroundColor: tone.color }} />
        <span className="font-medium" style={{ color: tone.color }}>
          {tone.label}
        </span>
        <span className="ml-auto font-mono tabular-nums text-txt-mid">{fmtUtcTime(check.timestamp)}</span>
      </div>
      <p className="mt-1 text-txt-mid">
        {run}
        {ago === 'now' ? 'just now' : `${ago} ago`}
      </p>
      <div className="my-1.5 h-px bg-white/[0.06]" />
      <dl className="space-y-1">
        {cause && (
          <Row label="Cause">
            <span style={{ color: cause.color }}>{cause.label}</span>
          </Row>
        )}
        <Row label="Response">
          <span style={{ color: check.error_type === 'http' ? ERROR_TYPE.http.color : undefined }}>
            {check.http_status_code ? `HTTP ${check.http_status_code}` : 'none'}
          </span>
        </Row>
        <Row label="Latency">{latency != null ? `${latency} ms` : <span className="text-txt-lo">—</span>}</Row>
        {/* The target applies to the average, so one slow check is shown, not flagged. */}
        {latencyTarget != null && latency != null && (
          <Row label="Avg target">
            <span className="text-txt-mid">≤ {latencyTarget} ms</span>
          </Row>
        )}
        {check.accepted_status && <Row label="Accepted">{check.accepted_status}</Row>}
      </dl>
    </HoverCard>
  )
}

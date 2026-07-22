import type { ReactNode } from 'react'
import { Check, Info, TriangleAlert } from 'lucide-react'

/** Inline spinner. Inherits color from the surrounding text (border-current). */
export function Spinner({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

const ALERT_TONES = {
  success: { classes: 'border-ok/25 bg-ok/[0.08] text-ok', Icon: Check },
  error: { classes: 'border-crit/25 bg-crit/[0.08] text-crit', Icon: TriangleAlert },
  info: { classes: 'border-edge bg-soft text-txt-mid', Icon: Info },
} as const

/** Status banner used for form errors, save confirmations, and load failures. */
export function Alert({
  tone,
  children,
  className = '',
  action,
}: {
  tone: keyof typeof ALERT_TONES
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  const { classes, Icon } = ALERT_TONES[tone]
  return (
    <div role="alert" className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] ${classes} ${className}`}>
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  )
}

const DOT_TONES = {
  ok: 'bg-ok',
  crit: 'bg-crit',
  warn: 'bg-warn',
  muted: 'bg-txt-faint',
} as const

/** Small status dot. `pulse` adds a slow attention pulse (used for DOWN). */
export function StatusDot({
  tone,
  pulse = false,
  className = '',
}: {
  tone: keyof typeof DOT_TONES
  pulse?: boolean
  className?: string
}) {
  return (
    <span className={`relative inline-flex h-2 w-2 shrink-0 ${className}`}>
      {pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${DOT_TONES[tone]}`} />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${DOT_TONES[tone]}`} />
    </span>
  )
}

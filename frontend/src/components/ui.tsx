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
  success: { classes: 'border-ok/25 bg-ok/[0.06] text-ok', Icon: Check },
  error: { classes: 'border-crit/25 bg-crit/[0.06] text-crit', Icon: TriangleAlert },
  info: { classes: 'border-white/[0.1] bg-white/[0.03] text-txt-mid', Icon: Info },
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
    <div role="alert" className={`flex items-center gap-2 rounded-md border px-3 py-2 text-[12px] ${classes} ${className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  )
}

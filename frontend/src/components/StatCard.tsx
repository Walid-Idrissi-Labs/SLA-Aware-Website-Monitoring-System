import type { ReactNode } from 'react'

interface Props {
  label: string
  /** Preformatted value ("99.9", "12 / 14"). Null renders an em dash. */
  value: ReactNode | null
  /** Muted unit rendered after the value (%, ms). */
  unit?: string
  sub?: ReactNode
  /** Colors the value for alarm states only — normal values stay neutral. */
  tone?: 'default' | 'crit' | 'warn'
}

const TONE_CLASS = {
  default: 'text-txt-hi',
  crit: 'text-crit',
  warn: 'text-warn',
} as const

/** Summary KPI tile: quiet label, large tabular value, support line. */
export default function StatCard({ label, value, unit, sub, tone = 'default' }: Props) {
  return (
    <div className="card px-5 py-4">
      <p className="text-[12px] font-medium text-txt-mid">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-1">
        {value === null ? (
          <span className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-txt-faint">—</span>
        ) : (
          <span className={`tnum text-[24px] font-semibold leading-tight tracking-[-0.02em] ${TONE_CLASS[tone]}`}>{value}</span>
        )}
        {unit && value !== null && <span className="text-[13px] font-medium text-txt-lo">{unit}</span>}
      </div>
      {sub && <p className="mt-1 text-[12px] text-txt-lo">{sub}</p>}
    </div>
  )
}

import type { ReactNode } from 'react'
import AnimatedNumber from './AnimatedNumber'

interface Props {
  label: string
  value: number
  decimals?: number
  unit?: string
  icon?: ReactNode
  accent?: string
  sub?: ReactNode
  index?: number
}

/** Hero KPI tile: micro-label, big animated readout, unit, and a support line. */
export default function StatCard({
  label,
  value,
  decimals = 0,
  unit,
  icon,
  accent = '#fa5c29',
  sub,
  index = 0,
}: Props) {
  return (
    <div
      className="panel group relative overflow-hidden p-4 animate-fade-up"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {/* accent hairline that lights up on hover */}
      <span
        className="absolute inset-x-0 top-0 h-px opacity-40 transition-opacity group-hover:opacity-100"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div className="flex items-center justify-between">
        <span className="micro">{label}</span>
        <span
          className="grid h-7 w-7 place-items-center rounded-md border border-white/[0.06] bg-white/[0.02] transition-colors"
          style={{ color: accent }}
        >
          {icon}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <AnimatedNumber
          value={value}
          decimals={decimals}
          className="font-display data text-[32px] font-bold leading-none text-txt-hi"
        />
        {unit && <span className="data text-[13px] font-medium text-txt-lo">{unit}</span>}
      </div>

      {sub && <div className="mt-2.5 text-[11px] text-txt-lo">{sub}</div>}
    </div>
  )
}

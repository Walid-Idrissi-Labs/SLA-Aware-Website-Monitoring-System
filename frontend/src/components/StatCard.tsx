import type { ReactNode } from 'react'
import AnimatedNumber from './AnimatedNumber'
import BorderGlow from './BorderGlow'
import { STATUS } from '../lib/format'

interface Props {
  label: string
  /** null renders an em dash — used when there is no data to summarize yet. */
  value: number | null
  decimals?: number
  unit?: string
  icon?: ReactNode
  accent?: string
  sub?: ReactNode
  index?: number
}

/** #rrggbb → "H S L" triple for BorderGlow's glowColor prop. */
function hexToHslString(hex: string): string {
  const m = hex.replace('#', '').match(/.{2}/g)
  if (!m) return '40 80 80'
  const [r, g, b] = m.map((h) => parseInt(h, 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)} ${Math.round(l * 100)}`
}

/** Hero KPI tile: micro-label, big animated readout, unit, and a support line.
 *  Wrapped in BorderGlow so the pointer edge lights up in the metric's status hue. */
export default function StatCard({
  label,
  value,
  decimals = 0,
  unit,
  icon,
  accent = STATUS.accent,
  sub,
  index = 0,
}: Props) {
  return (
    <div className="h-full animate-fade-up" style={{ animationDelay: `${index * 70}ms` }}>
      <BorderGlow
        glowColor={hexToHslString(accent)}
        colors={[accent, accent, accent]}
        edgeSensitivity={42}
        glowIntensity={0.45}
        fillOpacity={0}
        className="h-full"
      >
        <div className="relative p-4">
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
            {value === null ? (
              <span className="font-display data text-[32px] font-bold leading-none text-txt-dim">—</span>
            ) : (
              <AnimatedNumber
                value={value}
                decimals={decimals}
                className="font-display data text-[32px] font-bold leading-none text-txt-hi"
              />
            )}
            {unit && value !== null && <span className="data text-[13px] font-medium text-txt-lo">{unit}</span>}
          </div>

          {sub && <div className="mt-2.5 text-[11px] text-txt-lo">{sub}</div>}
        </div>
      </BorderGlow>
    </div>
  )
}

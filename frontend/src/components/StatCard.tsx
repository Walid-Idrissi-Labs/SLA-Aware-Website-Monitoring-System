import Counter from './Counter'

interface Props {
  label: string
  /** null renders an em dash — used when there is no data to summarize yet. */
  value: number | null
  decimals?: number
  unit?: string
  icon?: React.ReactNode
  accent?: string
  sub?: React.ReactNode
}

/**
 * Hero KPI cell. Rendered as the content of a MagicBento card, so it draws no
 * surface of its own — the grid supplies the frame, the spotlight and the rim.
 */
export default function StatCard({ label, value, decimals = 0, unit, icon, accent, sub }: Props) {
  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="micro">{label}</span>
        {icon && (
          <span
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/[0.03] text-txt-lo"
            style={accent ? { color: accent } : undefined}
          >
            {icon}
          </span>
        )}
      </div>

      <div className="mt-2">
        <div className="flex items-baseline gap-1.5">
          {value === null ? (
            <span className="data font-display text-[30px] font-bold leading-none text-txt-dim">—</span>
          ) : (
            <Counter
              value={value}
              decimals={decimals}
              direction="up"
              duration={0.9}
              bounce={0.28}
              stagger={0.03}
              fade={0.24}
              fontSize={30}
              fontWeight={700}
              tabular
              motionBlur
              intro
              className="data font-display leading-none text-txt-hi"
            />
          )}
          {unit && value !== null && <span className="data text-[12px] font-medium text-txt-lo">{unit}</span>}
        </div>
        {sub && <div className="mt-1.5 truncate text-[11px] text-txt-lo">{sub}</div>}
      </div>
    </div>
  )
}

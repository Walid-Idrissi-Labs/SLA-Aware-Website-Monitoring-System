interface Props {
  label: string
  value: string
  color?: string
}

/** Compact key/value readout used inside the command-bar ticker. */
export default function TickerStat({ label, value, color = '#eceef0' }: Props) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap font-pixel text-[12px] leading-none">
      <span className="text-txt-dim">{label}</span>
      <span className="tabular-nums" style={{ color }}>
        {value}
      </span>
    </span>
  )
}

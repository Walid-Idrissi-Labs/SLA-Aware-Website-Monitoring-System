interface Props {
  label: string
  value: string
  color?: string
}

/** Compact key/value readout used inside the command-bar ticker. */
export default function TickerStat({ label, value, color = '#eceef0' }: Props) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[10px]">
      <span className="uppercase tracking-wider text-txt-dim">{label}</span>
      <span className="font-semibold tabular-nums" style={{ color }}>
        {value}
      </span>
    </span>
  )
}

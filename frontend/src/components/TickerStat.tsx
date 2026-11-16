interface Props {
  label: string
  value: string
  color?: string
  /** Hide on narrow viewports, e.g. "hidden md:flex". */
  className?: string
}

/**
 * Compact key/value readout for the command bar. The label is deliberately the
 * only pixel-face text in the app, so these read as instrumentation rather than
 * as body copy.
 */
export default function TickerStat({ label, value, color = '#eceef0', className = '' }: Props) {
  return (
    <span
      className={`flex items-center gap-1.5 whitespace-nowrap font-pixel text-[12px] leading-none ${className}`.trim()}
    >
      <span className="text-txt-dim">{label}</span>
      <span className="tabular-nums" style={{ color }}>
        {value}
      </span>
    </span>
  )
}

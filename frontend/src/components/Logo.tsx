interface Props {
  size?: number
  className?: string
  style?: React.CSSProperties
}

/**
 * Brand mark — renders the SLA Monitor app icon (/logo.png), the same image
 * embedded in /public/favicon.svg so the browser-tab icon and every in-app
 * logo render identically.
 */
export default function Logo({ size = 36, className, style }: Props) {
  return (
    <img
      src="/logo.png"
      width={size}
      height={size}
      className={className}
      style={style}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}

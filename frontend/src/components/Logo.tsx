interface Props {
  size?: number
  className?: string
  style?: React.CSSProperties
}

/**
 * Brand mark — a 1:1 inline copy of /public/favicon.svg so the browser-tab
 * icon and every in-app logo render identically.
 */
export default function Logo({ size = 36, className, style }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <rect width="24" height="24" rx="4" fill="#fa5c29" />
      <g stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M12 16v5" />
        <path d="M16 14.639V21" />
        <path d="M20 10.656V21" />
        <path d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15" />
        <path d="M4 18.463V21" />
        <path d="M8 14.656V21" />
      </g>
    </svg>
  )
}

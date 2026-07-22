import { useId } from 'react'
import { STATUS } from '../lib/format'

interface Props {
  values: number[]
  /** stroke color */
  color?: string
  fill?: boolean
  width?: number
  height?: number
  strokeWidth?: number
  className?: string
  animate?: boolean
}

/** Compact smoothed line chart for inline trends. */
export default function Sparkline({
  values,
  color = STATUS.accent,
  fill = true,
  width = 120,
  height = 32,
  strokeWidth = 1.5,
  className,
  animate = true,
}: Props) {
  const gid = useId()
  if (!values || values.length < 2) {
    return <div className={className} style={{ width, height }} />
  }

  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const pad = strokeWidth + 1

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = pad + (1 - (v - min) / range) * (height - pad * 2)
    return [x, y] as const
  })

  // Catmull-Rom → cubic Bézier for a smooth, organic line.
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
  }

  const areaD = `${d} L ${width} ${height} L 0 ${height} Z`
  const lastX = pts[pts.length - 1][0]
  const lastY = pts[pts.length - 1][1]

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      fill="none"
    >
      <defs>
        <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={areaD} fill={`url(#spark-${gid})`} />}
      <path
        d={d}
        stroke={color}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={
          animate
            ? { strokeDasharray: 1000, strokeDashoffset: 1000, animation: 'draw 1.1s cubic-bezier(0.22,1,0.36,1) forwards' }
            : undefined
        }
      />
      <circle cx={lastX} cy={lastY} r={strokeWidth + 0.6} fill={color} />
      <style>{`@keyframes draw { to { stroke-dashoffset: 0; } }`}</style>
    </svg>
  )
}

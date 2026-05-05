import type { Check } from '../types'

interface Props {
  checks: Check[]
}

export default function LatencyChart({ checks }: Props) {
  if (checks.length === 0) {
    return (
      <div className="relative h-48 w-full bg-[#0d0e0f] border border-outline-variant overflow-hidden scanline flex items-center justify-center">
        <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">No data available</p>
      </div>
    )
  }

  const sortedChecks = [...checks].sort((a, b) => a.timestamp - b.timestamp)

  const maxLatency = Math.max(...sortedChecks.map((c) => c.latency_ms), 100)
  const minLatency = 0
  const range = maxLatency - minLatency || 1

  const paddingTop = 10
  const paddingBottom = 30
  const paddingLeft = 10
  const paddingRight = 10
  const width = 800
  const height = 192
  const chartWidth = width - paddingLeft - paddingRight
  const chartHeight = height - paddingTop - paddingBottom

  function x(i: number): number {
    return paddingLeft + (i / (sortedChecks.length - 1 || 1)) * chartWidth
  }

  function y(val: number): number {
    return paddingTop + (1 - (val - minLatency) / range) * chartHeight
  }

  const points = sortedChecks.map((c, i) => `${x(i)},${y(c.latency_ms)}`)
  const pathD = `M${points.join(' L')}`

  const gradientId = 'latencyGradient'
  const areaD = `${pathD} L${x(sortedChecks.length - 1)},${paddingTop + chartHeight} L${paddingLeft},${paddingTop + chartHeight} Z`

  return (
    <div className="relative w-full overflow-hidden scanline" style={{ height }}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fa5c29" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#fa5c29" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={areaD} fill={`url(#${gradientId})`} />
        <path
          d={pathD}
          fill="none"
          stroke="#fa5c29"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {sortedChecks.map((check, i) => {
          if (check.status === 'failure') {
            return (
              <circle
                key={i}
                cx={x(i)}
                cy={y(check.latency_ms)}
                r="3"
                fill="#f87171"
                opacity="0.7"
              />
            )
          }
          return null
        })}
      </svg>

      <div className="absolute bottom-2 left-4 right-4 flex justify-between text-[8px] font-mono text-outline uppercase">
        <span>{sortedChecks.length > 0 ? new Date(sortedChecks[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
        <span className="text-theme-orange">NOW</span>
      </div>
    </div>
  )
}
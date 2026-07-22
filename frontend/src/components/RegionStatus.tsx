import { Cloud } from 'lucide-react'

/**
 * Cognito pool IDs look like "us-east-1_XXXXXXXXX", so the region prefix is the
 * most reliable thing to read the deploy region off of. Fall back to us-east-1.
 */
function detectRegion(): string {
  const poolId = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined
  const region = poolId && poolId.includes('_') ? poolId.split('_')[0] : ''
  return region || 'us-east-1'
}

/** Command-bar badge: the backend is live, and where. */
export default function RegionStatus() {
  const region = detectRegion()

  return (
    <div
      className="hidden shrink-0 items-center gap-1.5 rounded border border-ok/25 bg-ok/[0.07] px-2 py-1 sm:flex"
      title={`Backend live on AWS ${region}`}
    >
      <Cloud
        className="h-3.5 w-3.5 animate-live-ping text-ok"
        strokeWidth={2}
        style={{ filter: 'drop-shadow(0 0 4px rgba(52,211,153,0.65))' }}
      />
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ok">Live</span>
      <span className="hidden font-mono text-[10px] text-ok/60 md:inline">{region}</span>
    </div>
  )
}

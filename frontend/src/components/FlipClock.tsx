import { useEffect, useRef, useState, type ReactNode } from 'react'
import Counter from './Counter'

interface Props {
  /** Epoch ms the current clean streak started, or null when unknown. */
  since: number | null
  /** True while an incident is still open — there is no streak to count. */
  open?: boolean
  label?: ReactNode
  className?: string
}

const pad = (value: number) => String(Math.max(0, Math.floor(value))).padStart(2, '0')

/**
 * Flip-clock readout of the time since the last incident resolved.
 *
 * Ticks once a second, but only while the tab is visible and the clock is on
 * screen. Each tick rolls a digit for most of that second, so a clock scrolled
 * out of view would otherwise burn as much CPU as one being watched.
 * Counter only animates a digit whose value actually changed, so a tick
 * usually costs one rolling tile.
 */
export default function FlipClock({ since, open = false, label = 'No recorded incidents in', className = '' }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (since == null || open) return
    let timer = 0
    let onScreen = true
    // (Re)start from the current time when the clock can be seen; stop otherwise.
    const sync = () => {
      window.clearInterval(timer)
      if (document.hidden || !onScreen) return
      setNow(Date.now())
      timer = window.setInterval(() => setNow(Date.now()), 1000)
    }
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      sync()
    })
    if (root.current) observer.observe(root.current)
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      window.clearInterval(timer)
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [since, open])

  if (open) {
    return (
      <div className={`fc ${className}`.trim()}>
        <p className="fc__label">Incident in progress</p>
        <p className="fc__note">The streak restarts when the incident resolves.</p>
      </div>
    )
  }

  if (since == null) {
    return (
      <div className={`fc ${className}`.trim()}>
        <p className="fc__label">{label}</p>
        <p className="fc__note">Waiting for the first check.</p>
      </div>
    )
  }

  const seconds = Math.max(0, Math.floor((now - since) / 1000))
  const units = [
    { label: 'Days', value: Math.floor(seconds / 86_400) },
    { label: 'Hours', value: Math.floor((seconds % 86_400) / 3600) },
    { label: 'Minutes', value: Math.floor((seconds % 3600) / 60) },
    { label: 'Seconds', value: seconds % 60 },
  ]

  return (
    <div ref={root} className={`fc ${className}`.trim()}>
      <p className="fc__label">{label}</p>
      <div className="fc__row">
        {units.map((unit, index) => (
          <div key={unit.label} className="flex items-start gap-3">
            {index > 0 && (
              <span className="fc__colon" aria-hidden="true">
                <span />
                <span />
              </span>
            )}
            <div className="flex flex-col items-center gap-2.5">
              <div className="flex gap-1">
                <Counter
                  value={Number(pad(unit.value))}
                  minDigits={2}
                  direction="up"
                  duration={0.55}
                  bounce={0.25}
                  stagger={0.04}
                  fade={0}
                  fontSize={30}
                  fontWeight={600}
                  tabular
                  motionBlur
                  digitClassName="fc__digit"
                  gap={4}
                />
              </div>
              <span className="fc__unit">{unit.label}</span>
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        {units.map((unit) => `${unit.value} ${unit.label.toLowerCase()}`).join(', ')}
      </span>
    </div>
  )
}

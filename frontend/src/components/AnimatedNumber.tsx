import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number
  decimals?: number
  duration?: number
  className?: string
}

/** Smoothly counts from the previous value to the next whenever `value` changes. */
export default function AnimatedNumber({ value, decimals = 0, duration = 900, className }: Props) {
  const [display, setDisplay] = useState(value)
  const displayRef = useRef(value)
  const fromRef = useRef(value)
  const rafRef = useRef<number>()

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const from = fromRef.current
    const to = value
    if (reduce || from === to) {
      setDisplay(to)
      displayRef.current = to
      fromRef.current = to
      return
    }

    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      // easeOutExpo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      const next = from + (to - from) * eased
      displayRef.current = next
      setDisplay(next)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      // Resume from what's actually on screen, not the old target — otherwise
      // an interrupted animation visibly snaps on the next value change.
      fromRef.current = displayRef.current
    }
  }, [value, duration])

  return (
    <span className={className}>
      {display.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  )
}

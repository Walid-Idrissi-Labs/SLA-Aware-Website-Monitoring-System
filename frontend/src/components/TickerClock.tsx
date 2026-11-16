import { useEffect, useState } from 'react'

export default function TickerClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const date = now.toISOString().split('T')[0]
  const time = now.toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' })

  return (
    <div className="flex items-center gap-2.5 font-pixel text-[12px] leading-none">
      <span className="hidden text-txt-lo sm:inline">{date}</span>
      <span className="relative rounded border border-accent/25 bg-accent/[0.07] px-2 py-1 tabular-nums text-accent">
        {time}
        <span className="ml-1 text-[10px] text-accent/60">UTC</span>
      </span>
    </div>
  )
}

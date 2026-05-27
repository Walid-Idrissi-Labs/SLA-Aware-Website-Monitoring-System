import { useEffect, useState } from 'react'

export default function TickerClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date())
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [])

  const date = now.toISOString().split('T')[0]
  const time = now.toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' })

  return (
    <div className="flex items-center gap-2 text-[9px] text-[#6b6b73]">
      <span>{date}</span>
      <span className="text-[#fa5c29] font-bold">{time} UTC</span>
    </div>
  )
}

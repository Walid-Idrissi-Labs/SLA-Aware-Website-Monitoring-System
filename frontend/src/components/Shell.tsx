import type { ReactNode } from 'react'
import TopNav from './TopNav'
import TickerClock from './TickerClock'
import RegionStatus from './RegionStatus'

interface Props {
  ticker?: ReactNode
  children: ReactNode
}

/** App frame: sidebar · command-bar header · scrolling content. */
export default function Shell({ ticker, children }: Props) {
  return (
    <div className="flex min-h-screen text-txt-hi">
      <TopNav />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Command bar */}
        <header className="sticky top-0 z-30 flex h-12 items-center gap-4 border-b border-white/[0.06] bg-ink-900/70 px-4 backdrop-blur-xl">
          <span className="shrink-0 font-display text-[13px] font-bold tracking-tight text-txt-hi">
            SLA<span className="text-accent">://</span>MONITOR
          </span>

          <div className="hidden h-4 w-px bg-white/[0.08] md:block" />

          <div className="flex min-w-0 flex-1 items-center gap-5 overflow-hidden">{ticker}</div>

          <RegionStatus />
          <TickerClock />
        </header>

        {/* Content */}
        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  )
}

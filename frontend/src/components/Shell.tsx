import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import TickerClock from './TickerClock'
import RegionStatus from './RegionStatus'

interface Props {
  ticker?: ReactNode
  children: ReactNode
}

/**
 * App frame: navigation rail · a raised content panel with a fixed command bar
 * and its own scroll area.
 *
 * The panel owns the scrolling rather than the window, so the command bar
 * never needs `position: sticky` and the panel's rounded border stays put
 * instead of sliding away with the content.
 */
export default function Shell({ ticker, children }: Props) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#08090b] text-txt-hi">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col p-4 pl-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#0c0e11]">
          {/* Command bar */}
          <header className="flex h-12 flex-none items-center gap-4 border-b border-white/[0.07] px-4">
            <span className="shrink-0 font-display text-[13px] font-semibold tracking-tight text-txt-hi">
              SLA<span className="text-accent">://</span>MONITOR
            </span>

            <div className="hidden h-4 w-px bg-white/[0.08] md:block" />

            <div className="flex min-w-0 flex-1 items-center gap-5 overflow-hidden">{ticker}</div>

            <RegionStatus />
            <TickerClock />
          </header>

          {/* Content */}
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1440px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  )
}

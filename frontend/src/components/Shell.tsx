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
 * The app is exactly viewport height and the document never scrolls — the panel
 * owns the scrollbar. That keeps the rail, the command bar and the panel's
 * rounded border fixed, and avoids a second scrollbar on the window.
 */
export default function Shell({ ticker, children }: Props) {
  return (
    <div className="flex h-full gap-1.5 overflow-hidden bg-[#08090b] p-3 text-txt-hi">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-white/[0.07] bg-[#0c0e11]">
          {/* Command bar */}
          <header className="flex h-12 flex-none items-center gap-4 border-b border-white/[0.07] pl-4 pr-3">
            <div className="flex min-w-0 flex-1 items-center gap-5 overflow-hidden">{ticker}</div>

            <div className="hidden h-4 w-px shrink-0 bg-white/[0.08] sm:block" />

            <RegionStatus />
            <TickerClock />
          </header>

          {/* Content */}
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  )
}

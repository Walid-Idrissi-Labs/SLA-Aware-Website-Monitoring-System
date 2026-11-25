import { useEffect, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import Sidebar from './Sidebar'
import TickerClock from './TickerClock'
import RegionStatus from './RegionStatus'
import CommandPalette, { IS_MAC, PALETTE_KEY } from './CommandPalette'

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
  const [palette, setPalette] = useState<'palette' | 'shortcuts' | null>(null)

  // The app's one keyboard listener: ⌘K / Ctrl+K, "?", and j/k across the
  // overview's endpoint cards (real focus, so the ring and Enter work natively).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const modalOpen = document.querySelector('[aria-modal="true"]')
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault() // Firefox would focus its own search bar on Ctrl+K.
        if (!modalOpen || palette) setPalette((open) => (open === 'palette' ? null : 'palette'))
        return
      }
      if (palette || modalOpen || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === '?') {
        e.preventDefault()
        setPalette('shortcuts')
      } else if (e.key === 'j' || e.key === 'k') {
        const cards = [...document.querySelectorAll<HTMLElement>('main .mb__card[tabindex="0"]')]
        if (!cards.length) return
        e.preventDefault()
        const at = cards.indexOf(document.activeElement as HTMLElement)
        const step = e.key === 'j' ? 1 : -1
        const next = at < 0 ? (step > 0 ? 0 : cards.length - 1) : Math.min(cards.length - 1, Math.max(0, at + step))
        cards[next].focus()
        cards[next].scrollIntoView({ block: 'nearest' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [palette])

  return (
    <div className="flex h-full gap-1.5 overflow-hidden bg-[#08090b] p-3 text-txt-hi">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-white/[0.07] bg-[#0c0e11]">
          {/* Command bar */}
          <header className="flex h-12 flex-none items-center gap-4 border-b border-white/[0.07] pl-4 pr-3">
            <div className="flex min-w-0 flex-1 items-center gap-5 overflow-hidden">{ticker}</div>

            {/* Also the entry point on touch, where there is no keyboard. */}
            <button
              type="button"
              onClick={() => setPalette('palette')}
              aria-label="Open the command palette"
              aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'}
              className="flex h-7 flex-none items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 text-txt-lo transition-colors hover:bg-white/[0.06] hover:text-txt-hi"
            >
              <Search className="h-3.5 w-3.5" strokeWidth={2} />
              <kbd className="font-mono text-[11px]">{PALETTE_KEY}</kbd>
            </button>

            <div className="hidden h-4 w-px shrink-0 bg-white/[0.08] sm:block" />

            <RegionStatus />
            <TickerClock />
          </header>

          {/* Content */}
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>

      {palette && <CommandPalette mode={palette} onClose={() => setPalette(null)} />}
    </div>
  )
}

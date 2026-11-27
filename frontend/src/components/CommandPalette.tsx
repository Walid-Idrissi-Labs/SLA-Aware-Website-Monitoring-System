import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Grid3x3, Info, LayoutGrid, Plus, Radar, Route, Scale, Search, Settings as SettingsIcon, Workflow } from 'lucide-react'
import type { Project } from '../types'
import { getProjects } from '../lib/api'
import { bareUrl } from '../lib/format'
import { ABOUT_VIEWS } from '../about/views'

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
export const PALETTE_KEY = IS_MAC ? '⌘K' : 'Ctrl K'

const SHORTCUTS = [
  [PALETTE_KEY, 'Open the command palette'],
  ['?', 'Show these shortcuts'],
  ['j / k', 'Next / previous endpoint on the overview'],
  ['Enter', 'Open the focused endpoint'],
  ['Esc', 'Close a dialog'],
] as const

const GROUPS = ['Pages', 'About', 'Actions', 'Endpoints'] as const
const VIEW_ICON = { architecture: Workflow, check: Route, verdicts: Scale, coverage: Grid3x3 }

interface Item {
  id: string
  group: (typeof GROUPS)[number]
  label: string
  hint?: string
  icon: typeof Search
  run: () => void
}

// The palette mounts with each page's shell, so endpoints are kept for the
// session and refreshed in the background on every open.
let endpointCache: Project[] | null = null

/**
 * ⌘K palette, and the "?" shortcuts sheet in the same modal shell. A dialog
 * whose input drives a listbox through aria-activedescendant; focus returns to
 * where it was on close. Navigation and "Add endpoint" only: nothing destructive.
 */
export default function CommandPalette({ mode, onClose }: { mode: 'palette' | 'shortcuts'; onClose: () => void }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [endpoints, setEndpoints] = useState<Project[] | null>(endpointCache)
  const [activeId, setActiveId] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null
    ;(input.current ?? dialog.current)?.focus()
    return () => returnTo?.focus?.()
  }, [])

  useEffect(() => {
    if (mode !== 'palette') return
    let live = true
    getProjects()
      .then((projects) => {
        endpointCache = projects.filter((p) => p.active)
        if (live) setEndpoints(endpointCache)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [mode])

  // Pages and actions first, so endpoints arriving below never shift what is on screen.
  const items = useMemo(() => {
    const go = (to: string, state?: unknown) => () => {
      onClose()
      navigate(to, state ? { state } : undefined)
    }
    const all: Item[] = [
      { id: 'page:overview', group: 'Pages', label: 'Overview', icon: LayoutGrid, run: go('/dashboard') },
      { id: 'page:settings', group: 'Pages', label: 'Settings', icon: SettingsIcon, run: go('/settings') },
      { id: 'page:about', group: 'Pages', label: 'About', icon: Info, run: go('/about') },
      ...ABOUT_VIEWS.map((v) => ({ id: `about:${v.value}`, group: 'About' as const, label: v.label, icon: VIEW_ICON[v.value], run: go(v.path) })),
      { id: 'action:add', group: 'Actions', label: 'Add endpoint', icon: Plus, run: go('/dashboard', { addEndpoint: true }) },
      ...(endpoints ?? []).map((p) => ({
        id: `endpoint:${p.project_id}`,
        group: 'Endpoints' as const,
        label: p.name,
        hint: bareUrl(p.url),
        icon: Radar,
        run: go(`/projects/${p.project_id}`),
      })),
    ]
    const q = query.trim().toLowerCase()
    return q ? all.filter((item) => `${item.label} ${item.hint ?? ''}`.toLowerCase().includes(q)) : all
  }, [endpoints, query, navigate, onClose])

  // Keyed by id, so the endpoints arriving (or a refresh) never moves the selection.
  const active = items.find((item) => item.id === activeId) ?? items[0]

  useEffect(() => {
    if (active) document.getElementById(`palette-${active.id}`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    // Keep focus inside the dialog: there is nothing else to tab to in it.
    if (e.key === 'Tab') {
      e.preventDefault()
      return
    }
    if (mode !== 'palette' || !items.length) return
    const index = active ? items.indexOf(active) : -1
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      setActiveId(items[next].id)
    } else if (e.key === 'Enter' && active) {
      e.preventDefault()
      active.run()
    }
  }

  return (
    <div
      // Instant dim and a 140 ms pop: a palette has to feel immediate, not fade in over 0.6 s.
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'palette' ? 'Command palette' : 'Keyboard shortcuts'}
        tabIndex={-1}
        className="panel w-full max-w-[540px] animate-card-pop overflow-hidden outline-none"
      >
        {mode === 'palette' ? (
          <>
            <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-4">
              <Search className="h-4 w-4 flex-none text-txt-lo" strokeWidth={2} />
              <input
                ref={input}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActiveId(null)
                }}
                placeholder="Jump to an endpoint or page…"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-listbox"
                aria-activedescendant={active ? `palette-${active.id}` : undefined}
                aria-autocomplete="list"
                className="h-12 min-w-0 flex-1 bg-transparent text-[14px] text-txt-hi outline-none placeholder:text-txt-dim"
              />
              <kbd className="flex-none rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10.5px] text-txt-lo">Esc</kbd>
            </div>
            <div id="palette-listbox" role="listbox" aria-label="Results" className="max-h-[52vh] overflow-y-auto p-1.5 empty:hidden">
              {GROUPS.map((group) => {
                const members = items.filter((item) => item.group === group)
                if (!members.length) return null
                return (
                  <div key={group} role="group" aria-labelledby={`palette-group-${group}`}>
                    <p
                      id={`palette-group-${group}`}
                      className="px-3 pb-1 pt-2.5 text-[10.5px] font-medium uppercase tracking-wider text-txt-lo"
                    >
                      {group}
                    </p>
                    {members.map((item) => {
                      const selected = item === active
                      const Icon = item.icon
                      return (
                        <div
                          key={item.id}
                          id={`palette-${item.id}`}
                          role="option"
                          aria-selected={selected}
                          onMouseMove={() => !selected && setActiveId(item.id)}
                          onClick={item.run}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-[9px] px-3 py-2 text-[13.5px] ${
                            selected ? 'bg-white/[0.07] text-txt-hi' : 'text-txt-mid'
                          }`}
                        >
                          <Icon className="h-4 w-4 flex-none text-txt-lo" strokeWidth={1.75} />
                          <span className="min-w-0 truncate">{item.label}</span>
                          {item.hint && (
                            <span className="ml-auto min-w-0 truncate font-mono text-[11.5px] text-txt-lo">{item.hint}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
            {/* Outside the listbox, which may only own options and groups. */}
            {items.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-txt-lo">Nothing matches “{query}”.</p>}
            {endpoints == null && !query && <p className="px-4 pb-3 text-[11.5px] text-txt-dim">Loading endpoints…</p>}
          </>
        ) : (
          <div className="p-5">
            <p className="font-display text-[15px] font-semibold text-txt-hi">Keyboard shortcuts</p>
            <dl className="mt-3 space-y-2">
              {SHORTCUTS.map(([keys, what]) => (
                <div key={keys} className="flex items-center justify-between gap-4 text-[13px]">
                  <dt className="text-txt-mid">{what}</dt>
                  <dd>
                    <kbd className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[11.5px] text-txt-hi">
                      {keys}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}

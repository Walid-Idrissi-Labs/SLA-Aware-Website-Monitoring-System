import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Boxes, Settings as SettingsIcon, LogOut } from 'lucide-react'
import { logout, getStoredUser } from '../lib/auth'
import Logo from './Logo'
import type { User } from '../types'

/** Rail width when collapsed. Chosen so a 36px icon box padded by 12px lands
 *  dead centre (12 + 18 = 30 = 60 / 2). */
const COLLAPSED_W = 60
const EXPANDED_W = 300
const STORAGE_KEY = 'sidebar-collapsed'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

interface ItemProps {
  to?: string
  label: string
  active?: boolean
  onClick?: () => void
  children: React.ReactNode
}

function Item({ to, label, active, onClick, children }: ItemProps) {
  const className = `group flex h-9 w-full shrink-0 items-center gap-3 rounded-[10px] px-3 text-[14.5px] font-medium transition-colors duration-150 ${
    active ? 'bg-white/[0.07] text-txt-hi' : 'text-txt-mid hover:bg-white/[0.04] hover:text-txt-hi'
  }`

  const inner = (
    <>
      <span className="grid h-6 w-6 flex-none place-items-center">{children}</span>
      <span className="sidebar__label min-w-0 truncate">{label}</span>
    </>
  )

  if (to) {
    return (
      <Link to={to} className={className} title={label}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className} title={label}>
      {inner}
    </button>
  )
}

/**
 * Collapsible navigation rail.
 *
 * Only the <aside> width is animated. Its inner content keeps a fixed
 * expanded width and is clipped by `overflow-hidden`, so transitioning never
 * reflows the nav items — the icons stay exactly where they are and the labels
 * simply slide out of view. That is one layout change per frame on a single
 * element, instead of a re-layout of every item and its text.
 */
export default function Sidebar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const user = getStoredUser() as User | null
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === '1')
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const onChange = () => setNarrow(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // Width follows state only — no measuring, no observers, no rAF.
  const open = !collapsed && !narrow

  const toggle = () => {
    setCollapsed((previous) => {
      localStorage.setItem(STORAGE_KEY, previous ? '0' : '1')
      return !previous
    })
  }

  const dashActive = pathname === '/dashboard' || pathname.startsWith('/projects')

  return (
    <aside
      data-open={open ? '' : undefined}
      className="relative z-20 flex h-full shrink-0 flex-col overflow-hidden border-r border-white/[0.07] bg-[#0a0b0d] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      style={{ width: open ? EXPANDED_W : COLLAPSED_W }}
    >
      <div className="flex h-full flex-col" style={{ width: EXPANDED_W }}>
        {/* Brand — doubles as the collapse toggle */}
        <div className="flex h-16 flex-none items-center gap-3 px-3">
          <button
            type="button"
            onClick={toggle}
            aria-label={open ? 'Collapse navigation' : 'Expand navigation'}
            aria-expanded={open}
            className="grid h-9 w-9 flex-none place-items-center rounded-[10px] transition-colors duration-150 hover:bg-white/[0.06]"
          >
            <span style={{ filter: 'drop-shadow(0 3px 12px rgba(250,92,41,0.45))' }}>
              <Logo size={26} className="block" />
            </span>
          </button>
          <span className="sidebar__label truncate font-display text-[15px] font-semibold tracking-[-0.01em] text-txt-hi">
            SLA Monitor
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-3 pt-1">
          <Item to="/dashboard" label="Overview" active={dashActive}>
            <LayoutDashboard className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </Item>
          <Item to="/about" label="About" active={pathname === '/about'}>
            <Boxes className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </Item>
          <Item to="/settings" label="Settings" active={pathname === '/settings'}>
            <SettingsIcon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </Item>
          <Item label="Log out" onClick={() => { logout(); navigate('/login') }}>
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </Item>
        </nav>

        {/* Account */}
        <div className="flex flex-none items-center gap-3 px-3 pb-4">
          <span
            className="grid h-9 w-9 flex-none place-items-center rounded-full bg-accent/[0.14] font-mono text-[11px] font-semibold text-accent"
            aria-hidden="true"
          >
            {getInitials(user?.display_name || user?.email || 'U')}
          </span>
          <span className="sidebar__label min-w-0 leading-tight">
            <span className="block truncate text-[14px] font-medium text-txt-hi">
              {user?.display_name || 'Your account'}
            </span>
            <span className="block truncate text-[12px] text-txt-lo">{user?.email}</span>
          </span>
        </div>
      </div>
    </aside>
  )
}

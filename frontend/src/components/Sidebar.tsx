import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Boxes, Settings as SettingsIcon, LogOut, Waypoints } from 'lucide-react'
import { logout, getStoredUser } from '../lib/auth'
import { DEMO } from '../lib/demo'
import Logo from './Logo'
import type { User } from '../types'

/** Expanded rail width. The collapsed width lives in index.css (.rail) next to
 *  the hover rules, because the whole expansion is CSS-driven. */
const EXPANDED_W = 240

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
  const className = `group flex h-9 w-full shrink-0 items-center gap-3 rounded-[10px] px-2.5 text-[14px] font-medium transition-colors duration-150 ${
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
 * Navigation rail. Collapsed at 56px, expands to 240px on hover or keyboard
 * focus — all of it in CSS, so there is no state, no listener and no re-render.
 *
 * Expansion is an overlay: the rail is absolutely positioned over the content
 * panel, and its inner column keeps the expanded width inside `overflow-hidden`
 * so the nav items never reflow. The only animated property is the rail's own
 * width; labels fade, which is compositor-only.
 */
export default function Sidebar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const user = getStoredUser() as User | null
  const dashActive = pathname === '/dashboard' || pathname.startsWith('/projects')

  return (
    // Reserves the collapsed width in the flex row; the rail itself overlays.
    <div className="relative h-full w-14 shrink-0">
      <aside className="rail absolute inset-0 z-30 flex flex-col overflow-hidden rounded-[20px] border border-white/[0.07] bg-[#0d1014]">
        <div className="flex h-full flex-col" style={{ width: EXPANDED_W }}>
          {/* Brand */}
          <Link to="/dashboard" className="flex h-14 flex-none items-center gap-3 px-2.5" title="SLA Monitor">
            <span
              className="grid h-9 w-9 flex-none place-items-center"
              style={{ filter: 'drop-shadow(0 3px 12px rgba(250,92,41,0.45))' }}
            >
              <Logo size={26} className="block" />
            </span>
            <span className="sidebar__label truncate font-display text-[15px] font-semibold tracking-[-0.01em] text-txt-hi">
              SLA Monitor
            </span>
          </Link>

          <nav className="flex flex-1 flex-col gap-0.5 px-2 pt-1">
            <Item to="/dashboard" label="Overview" active={dashActive}>
              <LayoutDashboard className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </Item>
            <Item to="/pipeline" label="Pipeline" active={pathname === '/pipeline'}>
              <Waypoints className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </Item>
            <div className="my-2 h-px w-full bg-white/[0.07]" />
            <Item to="/about" label="About" active={pathname.startsWith('/about')}>
              <Boxes className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </Item>
            <Item to="/settings" label="Settings" active={pathname === '/settings'}>
              <SettingsIcon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </Item>
          </nav>

          {/* Destructive action, kept away from navigation */}
          <div className="flex-none px-2 pb-2">
            <div className="mb-2 h-px w-full bg-white/[0.07]" />
            <Item
              label={DEMO ? 'Exit demo' : 'Log out'}
              onClick={() => {
                logout()
                // In the demo, logout() already left with a full load; a router push would land in /demo.
                if (!DEMO) navigate('/login')
              }}
            >
              <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </Item>
          </div>

          {/* Account */}
          <div className="flex flex-none items-center gap-3 px-2.5 pb-3">
            <span
              className="grid h-9 w-9 flex-none place-items-center rounded-full bg-accent/[0.14] font-mono text-[11px] font-semibold text-accent"
              aria-hidden="true"
            >
              {getInitials(user?.display_name || user?.email || 'U')}
            </span>
            <span className="sidebar__label min-w-0 leading-tight">
              <span className="block truncate text-[13.5px] font-medium text-txt-hi">
                {user?.display_name || 'Your account'}
              </span>
              <span className="block truncate text-[12px] text-txt-lo">{user?.email}</span>
            </span>
          </div>
        </div>
      </aside>
    </div>
  )
}

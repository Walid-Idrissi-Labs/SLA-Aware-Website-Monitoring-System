import { Link, useLocation } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { logout, getStoredUser } from '../lib/auth'
import Logo from './Logo'
import type { User } from '../types'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`flex h-8 items-center rounded-lg px-3 text-[13px] font-medium transition-colors duration-100 ${
        active ? 'bg-soft text-txt-hi' : 'text-txt-mid hover:bg-soft/60 hover:text-txt-hi'
      }`}
    >
      {children}
    </Link>
  )
}

export default function TopNav() {
  const { pathname } = useLocation()
  const user = getStoredUser() as User | null
  const dashActive = pathname === '/dashboard' || pathname.startsWith('/projects')

  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <Logo size={22} className="block rounded-md" />
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-txt-hi">SLA Monitor</span>
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink to="/dashboard" active={dashActive}>
              Monitors
            </NavLink>
            <NavLink to="/settings" active={pathname === '/settings'}>
              Settings
            </NavLink>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden max-w-[220px] truncate text-[12.5px] text-txt-lo sm:block" title={user?.email}>
            {user?.email}
          </span>
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-edge bg-soft text-[11px] font-semibold text-txt-mid"
            title={user?.email || 'Account'}
          >
            {getInitials(user?.display_name || user?.email || 'U')}
          </span>
          <button onClick={logout} title="Sign out" aria-label="Sign out" className="icon-btn">
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </header>
  )
}

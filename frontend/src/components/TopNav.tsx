import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Settings as SettingsIcon, LogOut } from 'lucide-react'
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

interface NavItemProps {
  to: string
  label: string
  active: boolean
  children: React.ReactNode
}

function NavItem({ to, label, active, children }: NavItemProps) {
  return (
    <Link
      to={to}
      className={`group relative flex h-12 w-full items-center justify-center transition-colors ${
        active ? 'text-accent' : 'text-txt-lo hover:text-txt-mid'
      }`}
    >
      {/* active rail */}
      <span
        className={`absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r bg-accent transition-all duration-200 ${
          active ? 'opacity-100 shadow-glow-accent' : 'opacity-0'
        }`}
      />
      <span
        className={`grid h-9 w-9 place-items-center rounded-lg border transition-all duration-150 ${
          active
            ? 'border-accent/40 bg-accent/[0.1]'
            : 'border-transparent group-hover:border-white/10 group-hover:bg-white/[0.03]'
        }`}
      >
        {children}
      </span>
      {/* fly-out tooltip */}
      <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md border border-white/10 bg-ink-750 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-txt-hi opacity-0 shadow-xl transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100">
        {label}
      </span>
    </Link>
  )
}

export default function TopNav() {
  const { pathname } = useLocation()
  const user = getStoredUser() as User | null
  const dashActive = pathname === '/dashboard' || pathname.startsWith('/projects')

  return (
    <aside className="sticky top-0 z-40 flex h-screen w-16 shrink-0 select-none flex-col items-center border-r border-white/[0.06] bg-ink-900/70 backdrop-blur-xl">
      {/* Brand */}
      <Link to="/dashboard" className="group flex h-16 w-full items-center justify-center">
        <span
          className="relative transition-transform duration-200 group-hover:scale-105"
          style={{ filter: 'drop-shadow(0 4px 14px rgba(250,92,41,0.45))' }}
        >
          <Logo size={34} className="block" />
        </span>
      </Link>

      <div className="mb-1 h-px w-8 bg-white/[0.06]" />

      {/* Nav */}
      <nav className="flex w-full flex-1 flex-col items-center gap-1 pt-2">
        <NavItem to="/dashboard" label="Overview" active={dashActive}>
          <LayoutDashboard className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </NavItem>
        <NavItem to="/settings" label="Settings" active={pathname === '/settings'}>
          <SettingsIcon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </NavItem>
      </nav>

      {/* User + logout */}
      <div className="flex w-full flex-col items-center gap-2 py-4">
        <div className="h-px w-8 bg-white/[0.06]" />
        <div
          className="grid h-9 w-9 place-items-center rounded-lg border border-accent/25 bg-accent/[0.08] font-mono text-[11px] font-bold text-accent"
          title={user?.email || 'Account'}
        >
          {getInitials(user?.display_name || user?.email || 'U')}
        </div>
        <button
          onClick={logout}
          title="Sign out"
          aria-label="Sign out"
          className="group grid h-9 w-9 place-items-center rounded-lg text-txt-lo transition-colors hover:bg-crit/10 hover:text-crit"
        >
          <LogOut className="h-[16px] w-[16px]" strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  )
}

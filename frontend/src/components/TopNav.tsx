import { Link, useLocation } from 'react-router-dom'
import { logout, getStoredUser } from '../lib/auth'
import type { User } from '../types'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function TopNav() {
  const location = useLocation()
  const user = getStoredUser() as User | null

  return (
    <header className="glass-panel border-b border-theme-orange/20 shadow-[0_4px_30px_rgba(0,0,0,0.5)] z-50 sticky top-0">
      <div className="flex justify-between items-center w-full px-margin-page h-14 max-w-container-max mx-auto">
        <div className="flex items-center gap-10">
          <Link to="/dashboard" className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="SLA Aware Website Monitoring System"
              className="w-6 h-6 rounded-sm"
            />
            <span className="font-headline-md text-[20px] font-bold tracking-tight text-on-surface">
              SLA Aware Website Monitoring System
            </span>
          </Link>
          <nav className="hidden md:flex gap-8 items-center h-14">
            <Link
              to="/dashboard"
              className={`text-label-md font-bold h-full flex items-center border-b-2 transition-all ${
                location.pathname === '/dashboard'
                  ? 'text-theme-orange border-theme-orange text-glow-orange'
                  : 'text-on-surface-variant hover:text-on-surface hover:border-outline-variant'
              }`}
            >
              DASHBOARD
            </Link>
            <Link
              to="/settings"
              className={`text-label-md font-bold h-full flex items-center border-b-2 transition-all ${
                location.pathname === '/settings'
                  ? 'text-theme-orange border-theme-orange text-glow-orange'
                  : 'text-on-surface-variant hover:text-on-surface hover:border-outline-variant'
              }`}
            >
              SETTINGS
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-6 w-[1px] bg-outline-variant/50 mx-2"></div>
          <div className="flex items-center gap-3 pl-2 cursor-pointer hover:opacity-80 transition-opacity">
            <div className="text-right hidden sm:block">
              <p className="text-[12px] font-bold text-on-surface leading-none font-mono">{user?.display_name || 'User'}</p>
              <p className="text-[10px] text-theme-orange uppercase font-bold tracking-widest leading-none mt-1 font-mono">{user?.email?.split('@')[0] || 'USER'}</p>
            </div>
            <div
              className="w-8 h-8 rounded border border-theme-orange/30 glow-orange bg-surface-container flex items-center justify-center text-[10px] font-mono font-bold text-theme-orange"
              title={user?.email || ''}
            >
              {getInitials(user?.display_name || user?.email || 'U')}
            </div>
          </div>
          <button
            onClick={logout}
            className="ml-2 p-2 hover:bg-surface-container-high rounded transition-colors text-on-surface-variant hover:text-error"
            title="Sign out"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
          </button>
        </div>
      </div>
    </header>
  )
}
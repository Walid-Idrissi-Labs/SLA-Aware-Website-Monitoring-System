import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { logout, getStoredUser } from '../lib/auth'
import Logo from './Logo'
import {
  Navbar,
  NavBody,
  NavItems,
  MobileNav,
  MobileNavHeader,
  MobileNavMenu,
  MobileNavToggle,
} from './ui/resizable-navbar'
import type { User } from '../types'

const NAV_ITEMS = [
  { name: 'Monitors', link: '/dashboard' },
  { name: 'Settings', link: '/settings' },
]

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function Brand() {
  return (
    <Link to="/dashboard" className="relative z-20 flex shrink-0 items-center gap-2.5">
      <Logo size={24} className="block rounded-md" />
      <span className="text-[14px] font-semibold tracking-[-0.01em] text-txt-hi">SLA Monitor</span>
    </Link>
  )
}

function Avatar({ user }: { user: User | null }) {
  return (
    <span
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-edge bg-soft text-[11px] font-semibold text-txt-mid"
      title={user?.email || 'Account'}
    >
      {getInitials(user?.display_name || user?.email || 'U')}
    </span>
  )
}

export default function TopNav() {
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const user = getStoredUser() as User | null
  const activeIndex = pathname === '/settings' ? 1 : 0

  return (
    <Navbar>
      {/* Desktop */}
      <NavBody>
        <Brand />
        <NavItems items={NAV_ITEMS} activeIndex={activeIndex} />
        <div className="relative z-20 flex items-center gap-3">
          <span
            className="hidden max-w-[180px] truncate text-[12.5px] text-txt-lo sm:block"
            title={user?.email}
          >
            {user?.email}
          </span>
          <Avatar user={user} />
          <button onClick={logout} title="Sign out" aria-label="Sign out" className="icon-btn">
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </NavBody>

      {/* Mobile */}
      <MobileNav>
        <MobileNavHeader>
          <Brand />
          <MobileNavToggle isOpen={mobileOpen} onClick={() => setMobileOpen((v) => !v)} />
        </MobileNavHeader>

        <MobileNavMenu isOpen={mobileOpen} onClose={() => setMobileOpen(false)}>
          {NAV_ITEMS.map((item, idx) => (
            <Link
              key={item.link}
              to={item.link}
              onClick={() => setMobileOpen(false)}
              className={`flex h-10 items-center rounded-lg px-3 text-[13px] font-medium transition-colors duration-100 ${
                activeIndex === idx
                  ? 'bg-soft text-txt-hi'
                  : 'text-txt-mid hover:bg-soft/60 hover:text-txt-hi'
              }`}
            >
              {item.name}
            </Link>
          ))}

          <div className="my-1 h-px bg-edge" />

          <div className="flex items-center justify-between gap-3 px-3 py-1.5">
            <span className="flex items-center gap-2.5 overflow-hidden">
              <Avatar user={user} />
              <span className="truncate text-[12.5px] text-txt-lo" title={user?.email}>
                {user?.email}
              </span>
            </span>
            <button
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              className="icon-btn shrink-0"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </MobileNavMenu>
      </MobileNav>
    </Navbar>
  )
}

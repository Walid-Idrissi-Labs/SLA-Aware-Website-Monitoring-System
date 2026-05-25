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
  const path = location.pathname

  return (
    <aside className="w-14 bg-[#08080a] border-r border-[#1a1a1e] flex flex-col shrink-0 select-none">
      {/* Logo */}
      <div className="h-10 flex items-center justify-center border-b border-[#1a1a1e]">
        <div className="w-5 h-5 bg-[#fa5c29] flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-1 flex flex-col items-center">
        <Link
          to="/dashboard"
          className={`w-full py-3 flex flex-col items-center gap-1 cursor-pointer transition-colors ${
            path === '/dashboard'
              ? 'bg-[rgba(250,92,41,0.06)] border-l-2 border-l-[#fa5c29] text-[#fa5c29]'
              : 'text-[#3f3f46] hover:text-[#6b6b73] hover:bg-[#0e0e11]'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z" />
          </svg>
          <span className="text-[7px] uppercase tracking-[0.2em] font-bold">F1</span>
        </Link>

        <Link
          to="/settings"
          className={`w-full py-3 flex flex-col items-center gap-1 cursor-pointer transition-colors ${
            path === '/settings'
              ? 'bg-[rgba(250,92,41,0.06)] border-l-2 border-l-[#fa5c29] text-[#fa5c29]'
              : 'text-[#3f3f46] hover:text-[#6b6b73] hover:bg-[#0e0e11]'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.59c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.212 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-[7px] uppercase tracking-[0.2em] font-bold">F2</span>
        </Link>
      </nav>

      {/* User */}
      <div className="p-2 border-t border-[#1a1a1e]">
        <button
          onClick={logout}
          className="w-8 h-8 mx-auto bg-[rgba(250,92,41,0.1)] border border-[rgba(250,92,41,0.2)] flex items-center justify-center text-[9px] font-bold text-[#fa5c29] cursor-pointer hover:bg-[rgba(250,92,41,0.15)] transition-colors"
          title={user?.email || 'Sign out'}
        >
          {getInitials(user?.display_name || user?.email || 'U')}
        </button>
      </div>
    </aside>
  )
}
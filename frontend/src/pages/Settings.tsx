import { useEffect, useState } from 'react'
import TopNav from '../components/TopNav'
import { getMe, putMe } from '../lib/api'
import type { User } from '../types'

export default function Settings() {
  const [user, setUser] = useState<User | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [notificationEmail, setNotificationEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await getMe()
        setUser(data)
        setDisplayName(data.display_name || '')
        setNotificationEmail(data.notification_email || '')
      } catch {
        setMessage({ type: 'error', text: 'Failed to load profile' })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const updated = await putMe({ display_name: displayName, notification_email: notificationEmail })
      setUser(updated)
      setMessage({ type: 'success', text: 'Profile updated successfully' })
    } catch {
      setMessage({ type: 'error', text: 'Failed to update profile' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] text-[#d4d4d8] flex text-[11px] font-mono">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-[#fa5c29] border-t-transparent animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#d4d4d8] flex text-[11px] font-mono">
      <TopNav />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Ticker */}
        <header className="h-9 bg-[#08080a] border-b border-[#1a1a1e] flex items-center px-3 shrink-0">
          <div className="flex items-center gap-1.5 mr-4">
            <span className="text-[9px] font-bold text-[#fa5c29] uppercase tracking-widest">SLA_AWARE</span>
            <span className="text-[#27272a]">|</span>
            <span className="text-[9px] text-[#6b6b73]">MONITOR_v2.4.1</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-[9px] text-[#6b6b73]">
            <span>{new Date().toISOString().split('T')[0]}</span>
            <span className="text-[#fa5c29] font-bold">{new Date().toLocaleTimeString('en-US', { hour12: false })} UTC</span>
          </div>
        </header>

        <main className="flex-1 max-w-2xl mx-auto px-6 py-8 w-full">
          <div className="mb-6 pb-4 border-b border-[#1a1a1e]">
            <h1 className="text-[18px] font-bold tracking-tight">USER_SETTINGS</h1>
            <p className="text-[11px] text-[#6b6b73] mt-1">Profile & notification preferences</p>
          </div>

          {message && (
            <div
              className={`mb-4 px-3 py-2 text-[11px] ${
                message.type === 'success'
                  ? 'bg-[rgba(74,222,128,0.06)] border border-[rgba(74,222,128,0.12)] text-[#4ade80]'
                  : 'bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.12)] text-[#f87171]'
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="border border-[#1a1a1e] bg-[#0d0d10]">
            <div className="px-3 py-2 border-b border-[#1a1a1e] bg-[#08080a]/50">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-[#fa5c29]" />
                <span className="text-[10px] font-bold text-[#d4d4d8] uppercase tracking-widest">PROFILE_DATA</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1">User_ID</label>
                <p className="text-[12px] text-[#d4d4d8] bg-[#08080a] px-3 py-2 border border-[#1a1a1e] font-mono">
                  {user?.user_id}
                </p>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1">Email (Cognito)</label>
                <p className="text-[12px] text-[#d4d4d8] bg-[#08080a] px-3 py-2 border border-[#1a1a1e]">
                  {user?.email}
                </p>
                <p className="text-[9px] text-[#3f3f46] mt-1">Managed by Cognito. Cannot be changed here.</p>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1" htmlFor="displayName">
                  Display_Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-[#08080a] border border-[#1a1a1e] text-[#d4d4d8] px-3 py-2 text-[12px] focus:border-[#fa5c29] focus:outline-none transition-colors"
                  placeholder="Your display name"
                />
              </div>

              <div>
                <label className="block text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1" htmlFor="notificationEmail">
                  Notification_Email
                </label>
                <input
                  id="notificationEmail"
                  type="email"
                  value={notificationEmail}
                  onChange={(e) => setNotificationEmail(e.target.value)}
                  className="w-full bg-[#08080a] border border-[#1a1a1e] text-[#d4d4d8] px-3 py-2 text-[12px] focus:border-[#fa5c29] focus:outline-none transition-colors"
                  placeholder="alerts@example.com"
                />
                <p className="text-[9px] text-[#3f3f46] mt-1">Downtime alerts and weekly SLA reports destination.</p>
              </div>

              <div className="pt-3 border-t border-[#1a1a1e]">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-[#fa5c29] hover:bg-[#fa5c29]/90 text-white text-[11px] font-bold active:scale-[0.97] transition-all disabled:opacity-50"
                >
                  {saving && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {saving ? 'Saving...' : 'Save_Changes'}
                </button>
              </div>
            </form>
          </div>
        </main>

        {/* Status Bar */}
        <div className="h-6 bg-[#08080a] border-t border-[#1a1a1e] flex items-center px-3 text-[9px] text-[#3f3f46] shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-1 h-1 bg-[#4ade80]" />
              CONN_OK
            </span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <span>MEM:42%</span>
            <span>CPU:12%</span>
            <span className="text-[#fa5c29] font-bold">● LIVE</span>
          </div>
        </div>
      </div>
    </div>
  )
}
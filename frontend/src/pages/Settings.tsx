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
      <div className="min-h-screen flex flex-col">
        <TopNav />
        <main className="flex-1 flex items-center justify-center">
          <span className="material-symbols-outlined text-theme-orange animate-spin text-3xl">progress_activity</span>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 max-w-2xl mx-auto px-margin-page py-8 w-full">
        <div className="mb-8 border-b border-outline-variant/30 pb-6">
          <h1 className="font-headline-lg text-[28px] tracking-tight text-on-surface uppercase">Settings</h1>
          <p className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider mt-1">User profile & notification preferences</p>
        </div>

        {message && (
          <div className={`mb-6 px-4 py-3 rounded font-mono text-sm ${message.type === 'success' ? 'bg-status-healthy/10 border border-status-healthy/30 text-status-healthy' : 'bg-error-container border border-error/30 text-error'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-surface-container-low border border-outline-variant p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-widest mb-2">User ID</label>
              <p className="font-mono text-sm text-on-surface bg-surface-container px-3 py-2 rounded border border-outline-variant">{user?.user_id}</p>
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-widest mb-2">Email (Cognito)</label>
              <p className="font-mono text-sm text-on-surface bg-surface-container px-3 py-2 rounded border border-outline-variant">{user?.email}</p>
              <p className="text-[10px] text-on-surface-variant mt-1 font-mono">Email is managed by Cognito and cannot be changed here.</p>
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-widest mb-2" htmlFor="displayName">Display Name</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-surface-container border border-outline-variant text-on-surface px-3 py-2 rounded font-mono text-sm focus:border-theme-orange focus:outline-none transition-colors"
                placeholder="Your display name"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-widest mb-2" htmlFor="notificationEmail">Notification Email</label>
              <input
                id="notificationEmail"
                type="email"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                className="w-full bg-surface-container border border-outline-variant text-on-surface px-3 py-2 rounded font-mono text-sm focus:border-theme-orange focus:outline-none transition-colors"
                placeholder="alerts@example.com"
              />
              <p className="text-[10px] text-on-surface-variant mt-1 font-mono">Where downtime alerts and weekly SLA reports are sent.</p>
            </div>

            <div className="pt-4 border-t border-outline-variant">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-theme-orange text-surface-container-lowest px-6 py-2 rounded font-bold text-sm hover:bg-theme-orange/90 active:scale-95 transition-all glow-orange disabled:opacity-50"
              >
                {saving ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-sm">save</span>}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
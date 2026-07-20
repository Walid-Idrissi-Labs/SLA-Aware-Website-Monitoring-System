import { useEffect, useState } from 'react'
import { Hash, Mail, User as UserIcon, Bell, Check, TriangleAlert } from 'lucide-react'
import Shell from '../components/Shell'
import TickerStat from '../components/TickerStat'
import { hydrateProfile, putMe } from '../lib/api'
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
        // Loads the profile, creating it server-side if this user predates the
        // first-login bootstrap. Never throws — always resolves to a profile.
        const data = await hydrateProfile()
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

  return (
    <Shell ticker={<TickerStat label="Section" value="Settings" color="#fa5c29" />}>
      {loading ? (
        <div className="grid h-[60vh] place-items-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : (
        <div className="mx-auto w-full max-w-2xl">
          <div className="animate-fade-up">
            <p className="kicker mb-1.5">Account</p>
            <h1 className="text-sheen font-display text-[26px] font-bold tracking-tight">Settings</h1>
            <p className="mt-1 text-[12px] text-txt-lo">Manage your identity and where alerts are delivered.</p>
          </div>

          {message && (
            <div
              className={`mt-5 flex items-center gap-2 rounded-md border px-3 py-2.5 text-[12px] animate-fade-in ${
                message.type === 'success'
                  ? 'border-ok/25 bg-ok/[0.06] text-ok'
                  : 'border-crit/25 bg-crit/[0.06] text-crit'
              }`}
            >
              {message.type === 'success' ? <Check className="h-3.5 w-3.5" strokeWidth={1.75} /> : <TriangleAlert className="h-3.5 w-3.5" strokeWidth={1.75} />}
              {message.text}
            </div>
          )}

          {/* Identity (read-only) */}
          <div className="panel mt-5 animate-fade-up p-5" style={{ animationDelay: '80ms' }}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-txt-hi">Identity</span>
              <span className="rounded border border-white/[0.08] px-1.5 py-0.5 font-mono text-[9px] text-txt-lo">Cognito</span>
            </div>
            <div className="hr-accent mt-3" />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-white/[0.06] bg-ink-950/60 p-3">
                <div className="flex items-center gap-1.5 text-txt-lo">
                  <Hash className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span className="micro">User ID</span>
                </div>
                <p className="mt-1.5 truncate font-mono text-[12px] text-txt-mid">{user?.user_id}</p>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-ink-950/60 p-3">
                <div className="flex items-center gap-1.5 text-txt-lo">
                  <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span className="micro">Login Email</span>
                </div>
                <p className="mt-1.5 truncate font-mono text-[12px] text-txt-mid">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* Editable profile */}
          <form onSubmit={handleSubmit} className="panel mt-3 animate-fade-up p-5" style={{ animationDelay: '140ms' }}>
            <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-txt-hi">Profile & Notifications</span>
            <div className="hr-accent mt-3" />

            <div className="mt-4 space-y-4">
              <div>
                <label className="field-label" htmlFor="displayName">
                  <span className="inline-flex items-center gap-1.5"><UserIcon className="h-3 w-3" strokeWidth={1.75} /> Display Name</span>
                </label>
                <input id="displayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="field" placeholder="Your display name" />
              </div>
              <div>
                <label className="field-label" htmlFor="notificationEmail">
                  <span className="inline-flex items-center gap-1.5"><Bell className="h-3 w-3" strokeWidth={1.75} /> Notification Email</span>
                </label>
                <input id="notificationEmail" type="email" value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} className="field" placeholder="alerts@example.com" />
                <p className="mt-1.5 text-[10px] text-txt-dim">Destination for downtime alerts and weekly SLA reports.</p>
              </div>
            </div>

            <div className="mt-5 flex justify-end border-t border-white/[0.06] pt-4">
              <button type="submit" disabled={saving} className="btn-accent">
                {saving ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Check className="h-3.5 w-3.5" strokeWidth={1.75} />}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </Shell>
  )
}

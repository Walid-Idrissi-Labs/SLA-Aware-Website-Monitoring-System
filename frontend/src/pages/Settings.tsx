import { useEffect, useState } from 'react'
import Shell from '../components/Shell'
import { Alert, Spinner } from '../components/ui'
import { hydrateProfile, putMe } from '../lib/api'
import { storeUser } from '../lib/auth'
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
        // first-login bootstrap.
        const data = await hydrateProfile()
        setUser(data)
        setDisplayName(data.display_name || '')
        setNotificationEmail(data.notification_email || '')
      } catch (e) {
        setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to load profile' })
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
      // Keep the cached copy in sync so the navbar initials update immediately.
      storeUser(updated)
      setMessage({ type: 'success', text: 'Profile updated' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update profile' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell>
      {loading ? (
        <div className="grid h-[60vh] place-items-center text-txt-lo">
          <Spinner size={22} />
        </div>
      ) : (
        <div className="mx-auto w-full max-w-xl">
          <div className="animate-fade-up">
            <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-txt-hi">Settings</h1>
            <p className="mt-1 text-[13px] text-txt-mid">Manage your profile and where alerts are delivered.</p>
          </div>

          {message && (
            <Alert tone={message.type} className="mt-5 animate-fade-in">
              {message.text}
            </Alert>
          )}

          {/* Account (read-only) */}
          <div className="card mt-6 animate-fade-up" style={{ animationDelay: '40ms' }}>
            <div className="border-b border-edge px-5 py-3.5">
              <h2 className="text-[13.5px] font-semibold text-txt-hi">Account</h2>
              <p className="mt-0.5 text-[12px] text-txt-lo">Managed by Amazon Cognito — sign-in details can't be changed here.</p>
            </div>
            <dl className="divide-y divide-edge/60 px-5">
              <div className="flex items-center justify-between gap-4 py-3.5">
                <dt className="text-[13px] text-txt-mid">Email</dt>
                <dd className="truncate text-[13px] text-txt-hi">{user?.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3.5">
                <dt className="shrink-0 text-[13px] text-txt-mid">User ID</dt>
                <dd className="truncate font-mono text-[12px] text-txt-lo" title={user?.user_id}>
                  {user?.user_id}
                </dd>
              </div>
            </dl>
          </div>

          {/* Editable profile */}
          <form onSubmit={handleSubmit} className="card mt-3 animate-fade-up" style={{ animationDelay: '80ms' }}>
            <div className="border-b border-edge px-5 py-3.5">
              <h2 className="text-[13.5px] font-semibold text-txt-hi">Profile and notifications</h2>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div>
                <label className="label" htmlFor="displayName">
                  Display name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input"
                  placeholder="Your display name"
                />
              </div>
              <div>
                <label className="label" htmlFor="notificationEmail">
                  Notification email
                </label>
                <input
                  id="notificationEmail"
                  type="email"
                  value={notificationEmail}
                  onChange={(e) => setNotificationEmail(e.target.value)}
                  className="input"
                  placeholder="alerts@example.com"
                />
                <p className="help">Default destination for downtime alerts and weekly SLA reports.</p>
              </div>
            </div>

            <div className="flex justify-end border-t border-edge px-5 py-4">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving && <Spinner />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </Shell>
  )
}

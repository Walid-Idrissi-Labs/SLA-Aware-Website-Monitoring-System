import { useEffect, useState } from 'react'
import { X, Plus, Radar } from 'lucide-react'
import { createProject } from '../lib/api'
import { Alert, Spinner } from './ui'
import { PROJECT_DEFAULTS } from '../lib/format'
import type { Project, CreateProjectInput } from '../types'

interface Props {
  onClose: () => void
  onSuccess: (project: Project) => void
}

export default function AddProjectModal({ onClose, onSuccess }: Props) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [failureThreshold, setFailureThreshold] = useState<number>(PROJECT_DEFAULTS.failure_threshold)
  const [minUptime, setMinUptime] = useState<number>(PROJECT_DEFAULTS.min_uptime_pct)
  const [maxLatency, setMaxLatency] = useState<number>(PROJECT_DEFAULTS.max_avg_latency_ms)
  const [notificationEmail, setNotificationEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !loading && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, loading])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !url.trim()) {
      setError('Name and URL are required')
      return
    }
    let normalizedUrl = url.trim()
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl
    }
    setLoading(true)
    setError(null)
    try {
      const data: CreateProjectInput = {
        name: name.trim(),
        url: normalizedUrl,
        failure_threshold: failureThreshold,
        thresholds: { min_uptime_pct: minUptime, max_avg_latency_ms: maxLatency },
      }
      if (notificationEmail.trim()) data.notification_email = notificationEmail.trim()
      const project = await createProject(data)
      onSuccess(project)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label="Add endpoint" className="panel frame-corners w-full max-w-lg animate-scale-in overflow-hidden">
        <div className="panel-head">
          <div className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-accent/[0.12] text-accent">
              <Radar className="h-3.5 w-3.5" strokeWidth={1.75} />
            </span>
            <div className="leading-tight">
              <p className="kicker">New endpoint</p>
              <p className="font-display text-[13px] font-semibold text-txt-hi">Add a website to monitor</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-md text-txt-lo transition-colors hover:bg-white/[0.05] hover:text-txt-hi">
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error && <Alert tone="error">{error}</Alert>}

          <div>
            <label className="field-label" htmlFor="projName">Name *</label>
            <input id="projName" type="text" value={name} onChange={(e) => setName(e.target.value)} className="field" placeholder="My Portfolio" required />
          </div>

          <div>
            <label className="field-label" htmlFor="projUrl">Target URL *</label>
            <input id="projUrl" type="text" value={url} onChange={(e) => setUrl(e.target.value)} className="field" placeholder="https://mysite.com" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label" htmlFor="failureThresh">Failure threshold</label>
              <input id="failureThresh" type="number" min={1} max={10} value={failureThreshold} onChange={(e) => setFailureThreshold(Number(e.target.value))} className="field" />
              <p className="mt-1.5 text-[10px] text-txt-dim">Consecutive failures before an alert</p>
            </div>
            <div>
              <label className="field-label" htmlFor="notifEmail">Notification email</label>
              <input id="notifEmail" type="email" value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} className="field" placeholder="Optional" />
              <p className="mt-1.5 text-[10px] text-txt-dim">Defaults to your account email</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label" htmlFor="minUptime">Min uptime %</label>
              <input id="minUptime" type="number" min={90} max={100} step={0.01} value={minUptime} onChange={(e) => setMinUptime(Number(e.target.value))} className="field" />
            </div>
            <div>
              <label className="field-label" htmlFor="maxLatency">Max latency (ms)</label>
              <input id="maxLatency" type="number" min={50} value={maxLatency} onChange={(e) => setMaxLatency(Number(e.target.value))} className="field" />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn-accent">
              {loading ? <Spinner /> : <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />}
              {loading ? 'Creating…' : 'Add endpoint'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

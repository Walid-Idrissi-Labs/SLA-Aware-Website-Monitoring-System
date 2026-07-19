import { useEffect, useState } from 'react'
import { X, Plus, TriangleAlert, Globe } from 'lucide-react'
import { createProject } from '../lib/api'
import type { Project, CreateProjectInput } from '../types'

interface Props {
  onClose: () => void
  onSuccess: (project: Project) => void
}

export default function AddProjectModal({ onClose, onSuccess }: Props) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [failureThreshold, setFailureThreshold] = useState(3)
  const [minUptime, setMinUptime] = useState(99.9)
  const [maxLatency, setMaxLatency] = useState(300)
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
      <div className="panel frame-corners w-full max-w-lg animate-scale-in overflow-hidden">
        <div className="panel-head">
          <div className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-accent/[0.12] text-accent">
              <Globe className="h-3.5 w-3.5" strokeWidth={2.4} />
            </span>
            <div className="leading-tight">
              <p className="kicker">New Endpoint</p>
              <p className="font-display text-[13px] font-semibold text-txt-hi">Register a website</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-txt-lo transition-colors hover:bg-white/[0.05] hover:text-txt-hi">
            <X className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-crit/25 bg-crit/[0.06] px-3 py-2 text-[12px] text-crit">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
              {error}
            </div>
          )}

          <div>
            <label className="field-label" htmlFor="projName">Project Name *</label>
            <input id="projName" type="text" value={name} onChange={(e) => setName(e.target.value)} className="field" placeholder="My Portfolio" required />
          </div>

          <div>
            <label className="field-label" htmlFor="projUrl">Target URL *</label>
            <input id="projUrl" type="text" value={url} onChange={(e) => setUrl(e.target.value)} className="field" placeholder="https://mysite.com" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label" htmlFor="failureThresh">Failure Threshold</label>
              <input id="failureThresh" type="number" min={1} max={10} value={failureThreshold} onChange={(e) => setFailureThreshold(Number(e.target.value))} className="field" />
              <p className="mt-1.5 text-[10px] text-txt-dim">Consecutive fails before alert</p>
            </div>
            <div>
              <label className="field-label" htmlFor="notifEmail">Notification Email</label>
              <input id="notifEmail" type="email" value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} className="field" placeholder="Optional" />
              <p className="mt-1.5 text-[10px] text-txt-dim">Defaults to your account email</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label" htmlFor="minUptime">Min Uptime %</label>
              <input id="minUptime" type="number" min={90} max={100} step={0.01} value={minUptime} onChange={(e) => setMinUptime(Number(e.target.value))} className="field" />
            </div>
            <div>
              <label className="field-label" htmlFor="maxLatency">Max Latency (ms)</label>
              <input id="maxLatency" type="number" min={50} value={maxLatency} onChange={(e) => setMaxLatency(Number(e.target.value))} className="field" />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn-accent">
              {loading ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <Plus className="h-3.5 w-3.5" strokeWidth={3} />
              )}
              {loading ? 'Creating…' : 'Create Endpoint'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

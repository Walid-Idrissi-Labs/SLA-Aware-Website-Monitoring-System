import { useState } from 'react'
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
        thresholds: {
          min_uptime_pct: minUptime,
          max_avg_latency_ms: maxLatency,
        },
      }
      if (notificationEmail.trim()) {
        data.notification_email = notificationEmail.trim()
      }
      const project = await createProject(data)
      onSuccess(project)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-container-low border border-outline-variant w-full max-w-lg rounded shadow-2xl">
        <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
          <h2 className="font-headline-md text-lg text-on-surface uppercase tracking-tight">Add Project</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-error-container border border-error/30 text-error px-3 py-2 rounded font-mono text-sm">{error}</div>
          )}

          <div>
            <label className="block text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-widest mb-1" htmlFor="projName">Project Name *</label>
            <input
              id="projName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-container border border-outline-variant text-on-surface px-3 py-2 rounded font-mono text-sm focus:border-theme-orange focus:outline-none"
              placeholder="My Portfolio"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-widest mb-1" htmlFor="projUrl">URL *</label>
            <input
              id="projUrl"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-surface-container border border-outline-variant text-on-surface px-3 py-2 rounded font-mono text-sm focus:border-theme-orange focus:outline-none"
              placeholder="https://mysite.com"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-widest mb-1" htmlFor="failureThresh">Failure Threshold</label>
              <input
                id="failureThresh"
                type="number"
                min={1}
                max={10}
                value={failureThreshold}
                onChange={(e) => setFailureThreshold(Number(e.target.value))}
                className="w-full bg-surface-container border border-outline-variant text-on-surface px-3 py-2 rounded font-mono text-sm focus:border-theme-orange focus:outline-none"
              />
              <p className="text-[9px] text-on-surface-variant mt-1 font-mono">Consecutive failures before alert</p>
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-widest mb-1" htmlFor="notifEmail">Notification Email</label>
              <input
                id="notifEmail"
                type="email"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                className="w-full bg-surface-container border border-outline-variant text-on-surface px-3 py-2 rounded font-mono text-sm focus:border-theme-orange focus:outline-none"
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-widest mb-1" htmlFor="minUptime">Min Uptime %</label>
              <input
                id="minUptime"
                type="number"
                min={90}
                max={100}
                step={0.01}
                value={minUptime}
                onChange={(e) => setMinUptime(Number(e.target.value))}
                className="w-full bg-surface-container border border-outline-variant text-on-surface px-3 py-2 rounded font-mono text-sm focus:border-theme-orange focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-widest mb-1" htmlFor="maxLatency">Max Avg Latency (ms)</label>
              <input
                id="maxLatency"
                type="number"
                min={50}
                value={maxLatency}
                onChange={(e) => setMaxLatency(Number(e.target.value))}
                className="w-full bg-surface-container border border-outline-variant text-on-surface px-3 py-2 rounded font-mono text-sm focus:border-theme-orange focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface-container-high border border-outline-variant text-on-surface rounded font-mono text-sm hover:border-outline transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-theme-orange text-surface-container-lowest px-6 py-2 rounded font-bold text-sm hover:bg-theme-orange/90 active:scale-95 transition-all glow-orange disabled:opacity-50"
            >
              {loading ? (
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-sm">add</span>
              )}
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
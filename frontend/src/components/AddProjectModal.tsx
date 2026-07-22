import { useState } from 'react'
import { Plus } from 'lucide-react'
import { createProject } from '../lib/api'
import { Alert, Spinner } from './ui'
import Modal from './Modal'
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
    <Modal
      title="Add monitor"
      description="Checks run every minute. You'll be alerted by email when it goes down."
      onClose={onClose}
      closeDisabled={loading}
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4 px-5 pb-5">
          {error && <Alert tone="error">{error}</Alert>}

          <div>
            <label className="label" htmlFor="projName">Name</label>
            <input id="projName" type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Marketing site" required />
          </div>

          <div>
            <label className="label" htmlFor="projUrl">URL</label>
            <input id="projUrl" type="text" value={url} onChange={(e) => setUrl(e.target.value)} className="input font-mono" placeholder="https://example.com" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="failureThresh">Failure threshold</label>
              <input id="failureThresh" type="number" min={1} max={10} value={failureThreshold} onChange={(e) => setFailureThreshold(Number(e.target.value))} className="input" />
              <p className="help">Consecutive failures before an alert</p>
            </div>
            <div>
              <label className="label" htmlFor="notifEmail">Notification email</label>
              <input id="notifEmail" type="email" value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} className="input" placeholder="Optional" />
              <p className="help">Defaults to your account email</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="minUptime">Uptime target (%)</label>
              <input id="minUptime" type="number" min={90} max={100} step={0.01} value={minUptime} onChange={(e) => setMinUptime(Number(e.target.value))} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="maxLatency">Latency target (ms)</label>
              <input id="maxLatency" type="number" min={50} value={maxLatency} onChange={(e) => setMaxLatency(Number(e.target.value))} className="input" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-edge px-5 py-4">
          <button type="button" onClick={onClose} disabled={loading} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <Spinner /> : <Plus className="h-4 w-4" strokeWidth={2} />}
            {loading ? 'Creating…' : 'Add monitor'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

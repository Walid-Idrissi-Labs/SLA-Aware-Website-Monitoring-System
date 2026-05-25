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
      <div className="bg-[#0d0d10] border border-[#1a1a1e] w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1a1a1e] bg-[#08080a] flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[#fa5c29]" />
            <span className="text-[10px] font-bold text-[#d4d4d8] uppercase tracking-widest">ADD_PROJECT</span>
          </div>
          <button onClick={onClose} className="text-[#3f3f46] hover:text-[#d4d4d8] transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {error && (
            <div className="bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.15)] text-[#f87171] px-3 py-2 text-[11px]">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1" htmlFor="projName">
              Project_Name *
            </label>
            <input
              id="projName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#08080a] border border-[#1a1a1e] text-[#d4d4d8] px-3 py-2 text-[12px] focus:border-[#fa5c29] focus:outline-none transition-colors"
              placeholder="My Portfolio"
              required
            />
          </div>

          <div>
            <label className="block text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1" htmlFor="projUrl">
              URL *
            </label>
            <input
              id="projUrl"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-[#08080a] border border-[#1a1a1e] text-[#d4d4d8] px-3 py-2 text-[12px] focus:border-[#fa5c29] focus:outline-none transition-colors"
              placeholder="https://mysite.com"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1" htmlFor="failureThresh">
                Failure_Threshold
              </label>
              <input
                id="failureThresh"
                type="number"
                min={1}
                max={10}
                value={failureThreshold}
                onChange={(e) => setFailureThreshold(Number(e.target.value))}
                className="w-full bg-[#08080a] border border-[#1a1a1e] text-[#d4d4d8] px-3 py-2 text-[12px] focus:border-[#fa5c29] focus:outline-none transition-colors"
              />
              <p className="text-[9px] text-[#3f3f46] mt-1">Consecutive failures before alert</p>
            </div>

            <div>
              <label className="block text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1" htmlFor="notifEmail">
                Notification_Email
              </label>
              <input
                id="notifEmail"
                type="email"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                className="w-full bg-[#08080a] border border-[#1a1a1e] text-[#d4d4d8] px-3 py-2 text-[12px] focus:border-[#fa5c29] focus:outline-none transition-colors"
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1" htmlFor="minUptime">
                Min_Uptime_%
              </label>
              <input
                id="minUptime"
                type="number"
                min={90}
                max={100}
                step={0.01}
                value={minUptime}
                onChange={(e) => setMinUptime(Number(e.target.value))}
                className="w-full bg-[#08080a] border border-[#1a1a1e] text-[#d4d4d8] px-3 py-2 text-[12px] focus:border-[#fa5c29] focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1" htmlFor="maxLatency">
                Max_Latency_MS
              </label>
              <input
                id="maxLatency"
                type="number"
                min={50}
                value={maxLatency}
                onChange={(e) => setMaxLatency(Number(e.target.value))}
                className="w-full bg-[#08080a] border border-[#1a1a1e] text-[#d4d4d8] px-3 py-2 text-[12px] focus:border-[#fa5c29] focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#1a1a1e]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-[#08080a] border border-[#1a1a1e] text-[#6b6b73] text-[11px] font-bold hover:border-[#52525b] hover:text-[#d4d4d8] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#fa5c29] hover:bg-[#fa5c29]/90 text-white text-[11px] font-bold active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {loading && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {loading ? 'Creating...' : 'Create_Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
import { useEffect, useState } from 'react'
import { X, Radar, Bell, Target } from 'lucide-react'
import Stepper, { Step } from './Stepper'
import { createProject } from '../lib/api'
import { Alert } from './ui'
import { PROJECT_DEFAULTS } from '../lib/format'
import type { Project, CreateProjectInput } from '../types'

interface Props {
  onClose: () => void
  onSuccess: (project: Project) => void
}

/**
 * Add-endpoint flow. Three short steps instead of one wall of fields: what to
 * watch, when to shout, and what counts as good.
 */
export default function AddProjectModal({ onClose, onSuccess }: Props) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [failureThreshold, setFailureThreshold] = useState<number>(PROJECT_DEFAULTS.failure_threshold)
  const [acceptedStatus, setAcceptedStatus] = useState<string>('200-399')
  const [minUptime, setMinUptime] = useState<number>(PROJECT_DEFAULTS.min_uptime_pct)
  const [maxLatency, setMaxLatency] = useState<number>(PROJECT_DEFAULTS.max_avg_latency_ms)
  const [notificationEmail, setNotificationEmail] = useState('')
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  async function create() {
    if (!name.trim() || !url.trim()) {
      setError('Name and URL are required')
      setStep(1)
      return
    }
    let normalizedUrl = url.trim()
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl
    }
    setSaving(true)
    setError(null)
    try {
      const data: CreateProjectInput = {
        name: name.trim(),
        url: normalizedUrl,
        failure_threshold: failureThreshold,
        accepted_status: acceptedStatus.trim(),
        thresholds: { min_uptime_pct: minUptime, max_avg_latency_ms: maxLatency },
      }
      if (notificationEmail.trim()) data.notification_email = notificationEmail.trim()
      onSuccess(await createProject(data))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div className="relative w-full max-w-[480px] animate-scale-in">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-2 -right-2 z-10 grid h-7 w-7 place-items-center rounded-md text-txt-lo transition-colors hover:bg-white/[0.06] hover:text-txt-hi"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>

        {error && (
          <Alert tone="error" className="mb-2">
            {error}
          </Alert>
        )}

        <Stepper
          step={step}
          onStepChange={setStep}
          onFinalStepCompleted={create}
          indicator="numbers"
          orientation="horizontal"
          width="100%"
          radius={22}
          linear={false}
          backButtonText="Back"
          nextButtonText="Continue"
          completeButtonText={saving ? 'Creating…' : 'Create endpoint'}
          nextButtonProps={{
            disabled: saving,
            onClick: (event) => {
              if (step === 1 && (!name.trim() || !url.trim())) {
                event.preventDefault()
                setError('Name and URL are required')
              } else {
                setError(null)
              }
            },
          }}
        >
          <Step title="Endpoint" icon={<Radar size={13} strokeWidth={2} />}>
            <div className="space-y-3.5">
              <div>
                <label className="field-label" htmlFor="projName">
                  Name
                </label>
                <input
                  id="projName"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="field"
                  placeholder="My Portfolio"
                  autoFocus
                />
              </div>
              <div>
                <label className="field-label" htmlFor="projUrl">
                  Target URL
                </label>
                <input
                  id="projUrl"
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="field"
                  placeholder="https://mysite.com"
                />
              </div>
            </div>
          </Step>

          <Step title="Alerting" icon={<Bell size={13} strokeWidth={2} />}>
            <div className="space-y-3.5">
              <div>
                <label className="field-label" htmlFor="acceptedStatus">
                  Accepted HTTP statuses
                </label>
                <input
                  id="acceptedStatus"
                  type="text"
                  value={acceptedStatus}
                  onChange={(e) => setAcceptedStatus(e.target.value)}
                  className="field"
                  placeholder="200-399"
                />
                <p className="mt-1.5 text-[10px] leading-relaxed text-txt-dim">
                  Ranges or codes, comma separated. Anything else counts as down. Sites behind bot protection
                  usually need their challenge status added here.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label" htmlFor="failureThresh">
                    Failure threshold
                  </label>
                  <input
                    id="failureThresh"
                    type="number"
                    min={1}
                    max={10}
                    value={failureThreshold}
                    onChange={(e) => setFailureThreshold(Number(e.target.value))}
                    className="field"
                  />
                  <p className="mt-1.5 text-[10px] text-txt-dim">Failures before an incident</p>
                </div>
                <div>
                  <label className="field-label" htmlFor="notifEmail">
                    Notify
                  </label>
                  <input
                    id="notifEmail"
                    type="email"
                    value={notificationEmail}
                    onChange={(e) => setNotificationEmail(e.target.value)}
                    className="field"
                    placeholder="Optional"
                  />
                  <p className="mt-1.5 text-[10px] text-txt-dim">Defaults to your email</p>
                </div>
              </div>
            </div>
          </Step>

          <Step title="SLA targets" icon={<Target size={13} strokeWidth={2} />}>
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label" htmlFor="minUptime">
                    Min uptime %
                  </label>
                  <input
                    id="minUptime"
                    type="number"
                    min={90}
                    max={100}
                    step={0.01}
                    value={minUptime}
                    onChange={(e) => setMinUptime(Number(e.target.value))}
                    className="field"
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="maxLatency">
                    Max latency (ms)
                  </label>
                  <input
                    id="maxLatency"
                    type="number"
                    min={50}
                    value={maxLatency}
                    onChange={(e) => setMaxLatency(Number(e.target.value))}
                    className="field"
                  />
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-txt-lo">
                These are the targets reports and the error budget are scored against — not what triggers an
                incident. Consecutive failures past the threshold do that.
              </p>
            </div>
          </Step>
        </Stepper>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Mail, ShieldCheck } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import CodeSlots, { type CodeSlotsStatus } from '../components/CodeSlots'
import { Alert, Spinner } from '../components/ui'
import { confirmSignUp, resendConfirmationCode, friendlyAuthMessage } from '../lib/cognito'

interface ConfirmState {
  email?: string
}

export default function ConfirmSignup() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? null) as ConfirmState | null

  const [email, setEmail] = useState(state?.email ?? '')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<CodeSlotsStatus>('idle')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function verify(value: string) {
    if (!email.trim()) {
      setError('Enter your email first, then the code.')
      setStatus('error')
      return
    }
    if (value.length !== 6) {
      setError('The code is six digits.')
      return
    }
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      await confirmSignUp(email.trim(), value)
      setStatus('success')
      window.setTimeout(
        () => navigate('/login', { state: { email: email.trim(), justConfirmed: true } }),
        900,
      )
    } catch (err) {
      setError(friendlyAuthMessage(err).message)
      setStatus('error')
      setLoading(false)
    }
  }

  async function handleResend() {
    if (!email.trim()) {
      setError('Enter your email first, then resend.')
      return
    }
    setResending(true)
    setError(null)
    setNotice(null)
    try {
      await resendConfirmationCode(email.trim())
      setNotice('A new code is on its way to your inbox.')
    } catch (err) {
      setError(friendlyAuthMessage(err).message)
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthLayout
      kicker="Verify Email"
      title="Enter your code"
      subtitle="We emailed you a 6-digit code. Enter it to activate your account."
      footer={
        <>
          Wrong address?{' '}
          <Link to="/signup" className="font-medium text-accent hover:underline">
            Start over
          </Link>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          verify(code)
        }}
        className="space-y-5"
      >
        {notice && (
          <Alert tone="success" className="animate-fade-in">
            {notice}
          </Alert>
        )}
        {error && (
          <Alert tone="error" className="animate-fade-in">
            {error}
          </Alert>
        )}

        <div>
          <label className="field-label" htmlFor="email">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3 w-3" strokeWidth={1.75} /> Email
            </span>
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <span className="field-label">Verification code</span>
          <div className="flex justify-center pt-1">
            <CodeSlots
              length={6}
              value={code}
              status={status}
              disabled={loading || status === 'success'}
              autoFocus={Boolean(state?.email)}
              onChange={(next) => {
                setCode(next)
                if (status === 'error') setStatus('idle')
              }}
              onComplete={verify}
              accentColor="#eceef0"
              inkColor="#eceef0"
              slotColor="#1c1f25"
              digitColor="#0e1115"
              dangerColor="#f87171"
              slotSize={46}
              gap={8}
              radius={12}
            />
          </div>
        </div>

        <button type="submit" disabled={loading || status === 'success'} className="btn-auth">
          {loading || status === 'success' ? (
            <Spinner size={16} />
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" strokeWidth={2} /> Verify &amp; continue
            </>
          )}
        </button>
      </form>

      <div className="mt-4 text-center text-[12px] text-txt-lo">
        Didn’t get it?{' '}
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="font-medium text-accent hover:underline disabled:opacity-60"
        >
          {resending ? 'Sending…' : 'Resend code'}
        </button>
      </div>
    </AuthLayout>
  )
}

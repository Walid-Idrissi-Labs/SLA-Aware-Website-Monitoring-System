import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Mail, KeyRound, ShieldCheck } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
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
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !code.trim()) {
      setError('Enter your email and the verification code.')
      return
    }
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      await confirmSignUp(email.trim(), code)
      navigate('/login', { state: { email: email.trim(), justConfirmed: true } })
    } catch (err) {
      setError(friendlyAuthMessage(err).message)
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
      <form onSubmit={handleSubmit} className="space-y-4">
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
          <label className="field-label" htmlFor="code">
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="h-3 w-3" strokeWidth={1.75} /> Verification code
            </span>
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="field text-center text-[16px] tracking-[0.5em]"
            placeholder="123456"
            required
          />
        </div>

        <button type="submit" disabled={loading} className="btn-auth">
          {loading ? (
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

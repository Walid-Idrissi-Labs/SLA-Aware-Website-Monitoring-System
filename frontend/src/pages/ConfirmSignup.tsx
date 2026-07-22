import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
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
      title="Check your email"
      subtitle="We sent a 6-digit verification code. Enter it to activate your account."
      footer={
        <>
          Wrong address?{' '}
          <Link to="/signup" className="link">
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
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="code">
            Verification code
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="input tnum text-center font-mono text-[16px] tracking-[0.4em]"
            placeholder="123456"
            required
          />
        </div>

        <button type="submit" disabled={loading} className="btn-primary h-10 w-full">
          {loading ? <Spinner size={16} /> : 'Verify and continue'}
        </button>
      </form>

      <p className="mt-4 text-center text-[13px] text-txt-mid">
        Didn't get it?{' '}
        <button type="button" onClick={handleResend} disabled={resending} className="link disabled:opacity-60">
          {resending ? 'Sending…' : 'Resend code'}
        </button>
      </p>
    </AuthLayout>
  )
}

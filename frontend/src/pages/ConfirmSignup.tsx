import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Mail, KeyRound, ShieldCheck, TriangleAlert, Check } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
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
          <div className="flex items-center gap-2 rounded-md border border-ok/25 bg-ok/[0.06] px-3 py-2 text-[12px] text-ok animate-fade-in">
            <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            {notice}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-crit/25 bg-crit/[0.06] px-3 py-2 text-[12px] text-crit animate-fade-in">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            {error}
          </div>
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

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent-sheen font-mono text-[12px] font-bold uppercase tracking-wider text-white shadow-glow-accent transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
        >
          {loading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
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

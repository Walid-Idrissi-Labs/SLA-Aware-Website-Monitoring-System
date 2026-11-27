import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, LogIn, Compass } from 'lucide-react'
import ActionButton from '../components/ActionButton'
import AuthLayout from '../components/AuthLayout'
import Logo from '../components/Logo'
import GoogleSignIn from '../components/GoogleSignIn'
import { Alert } from '../components/ui'
import { isAuthenticated, setToken } from '../lib/auth'
import { signIn, friendlyAuthMessage } from '../lib/cognito'
import { hydrateProfile } from '../lib/api'

/** What it does, in the system's real numbers: no sample figures on the first screen. */
const FACTS = [
  { label: 'Uptime checks', what: 'Each endpoint you add gets an HTTP check every minute, marked up, down or no evidence.' },
  { label: 'Incident detection', what: 'Three failed checks in a row, by default, open an incident and email you; the first passing check closes it.' },
  { label: 'SLA reports', what: 'Weekly and on-demand reports against your own targets: uptime, latency, incidents and a verdict.' },
]

interface LoginState {
  email?: string
  justConfirmed?: boolean
  passwordReset?: boolean
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? null) as LoginState | null

  const [email, setEmail] = useState(state?.email ?? '')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const expired = new URLSearchParams(location.search).has('expired')
  const [notice, setNotice] = useState<string | null>(
    state?.justConfirmed
      ? 'Email verified — you can sign in now.'
      : state?.passwordReset
        ? 'Password changed. Sign in with the new one.'
        : expired
        ? 'Your session expired. Sign in again.'
        : null
  )

  useEffect(() => {
    if (isAuthenticated()) navigate('/dashboard', { replace: true })
  }, [navigate])

  // Persist the token, hydrate (creating on first login) the app profile, then enter.
  async function completeLogin(idToken: string) {
    setToken(idToken)
    // Best-effort: the dashboard works without a hydrated profile.
    await hydrateProfile().catch(() => {})
    navigate('/dashboard')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const idToken = await signIn(email.trim(), password)
      await completeLogin(idToken)
    } catch (err) {
      const { code, message } = friendlyAuthMessage(err)
      // An unconfirmed account can't sign in — send them to verify instead.
      if (code === 'UserNotConfirmedException') {
        navigate('/confirm', { state: { email: email.trim() } })
        return
      }
      // Static, so it says nothing about whether the account exists (decision E: Google accounts have no password).
      setError(code === 'NotAuthorizedException' || code === 'UserNotFoundException' ? `${message} Signed up with Google? Use Continue with Google instead.` : message)
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Access your endpoints, uptime history, and SLA reports."
      aside={
        <div>
            <span className="block w-fit" style={{ filter: 'drop-shadow(0 6px 20px rgba(250,92,41,0.35))' }}>
              <Logo size={40} className="block" />
            </span>
            <h1 className="mt-6 max-w-md font-display text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-txt-hi">
              Know when your site is down, and whether it met its SLA.
            </h1>
            <dl className="mt-7 space-y-4">
              {FACTS.map((f) => (
                <div key={f.label} className="flex gap-4">
                  <dt className="w-36 shrink-0 pt-px font-mono text-[11px] uppercase tracking-wide text-accent">{f.label}</dt>
                  <dd className="text-[13px] leading-relaxed text-txt-mid">{f.what}</dd>
                </div>
              ))}
            </dl>
        </div>
      }
      footer={
        <>
          New to SLA Monitor?{' '}
          <Link to="/signup" className="font-medium text-accent hover:underline">
            Create an account
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
          <div className="flex items-baseline justify-between">
            <label className="field-label" htmlFor="password">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="h-3 w-3" strokeWidth={1.75} /> Password
              </span>
            </label>
            <Link to="/reset" state={{ email: email.trim() }} className="text-[11.5px] text-txt-lo hover:text-accent">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field pr-10"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-txt-lo transition-colors hover:text-txt-hi"
            >
              {showPw ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />}
            </button>
          </div>
        </div>

        <ActionButton
          type="submit"
          size="lg"
          fullWidth
          icon={<LogIn className="h-4 w-4" strokeWidth={2} />}
          state={loading ? 'loading' : 'idle'}
          labels={{ loading: 'Signing in…' }}
          disabled={loading}
        >
          Sign in
        </ActionButton>
      </form>

      <GoogleSignIn onError={setError} />

      {/* The demo is not a sign-in method: its own divider says why it is here. */}
      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/[0.08]" />
        <span className="text-[11px] text-txt-dim">no account?</span>
        <div className="h-px flex-1 bg-white/[0.08]" />
      </div>
      {/* A full load, not a router link: the demo runs under its own base path. */}
      <a href="/demo" className="btn-outline">
        <Compass className="h-4 w-4" strokeWidth={2} /> Explore the demo
      </a>
    </AuthLayout>
  )
}

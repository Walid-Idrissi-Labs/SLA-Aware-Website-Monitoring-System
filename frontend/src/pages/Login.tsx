import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import GoogleSignIn from '../components/GoogleSignIn'
import SpecularButton from '../components/SpecularButton'
import { Alert } from '../components/ui'
import { isAuthenticated, setToken } from '../lib/auth'
import { signIn, friendlyAuthMessage } from '../lib/cognito'
import { hydrateProfile } from '../lib/api'

interface LoginState {
  email?: string
  justConfirmed?: boolean
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
  const [notice, setNotice] = useState<string | null>(
    state?.justConfirmed ? 'Email verified — you can sign in now.' : null
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
      setError(message)
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      kicker="Secure Access"
      title="Sign in"
      subtitle="Access your endpoints, uptime history, and SLA reports."
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
          <label className="field-label" htmlFor="password">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3 w-3" strokeWidth={1.75} /> Password
            </span>
          </label>
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

        <SpecularButton
          type="submit"
          size="md"
          radius={10}
          tint="#fa5c29"
          tintOpacity={1}
          lineColor="#ffffff"
          baseColor="#fa5c29"
          textColor="#d8dbde"
          className="w-full transition-colors duration-150 hover:bg-[#e04d1f] hover:text-white"
          disabled={loading}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </SpecularButton>
      </form>

      <GoogleSignIn onError={setError} />
    </AuthLayout>
  )
}

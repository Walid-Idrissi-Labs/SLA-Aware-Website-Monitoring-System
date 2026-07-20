import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { User as UserIcon, Mail, Lock, Eye, EyeOff, ArrowRight, TriangleAlert } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import GoogleIcon from '../components/GoogleIcon'
import { buildGoogleLoginUrl } from '../lib/auth'
import { signUp, friendlyAuthMessage } from '../lib/cognito'

export default function Signup() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Email and password are required.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await signUp(email.trim(), password, name)
      // Cognito has emailed a verification code; go collect it.
      navigate('/confirm', { state: { email: email.trim() } })
    } catch (err) {
      setError(friendlyAuthMessage(err).message)
      setLoading(false)
    }
  }

  function handleGoogle() {
    setGoogleLoading(true)
    setError(null)
    buildGoogleLoginUrl()
      .then((url) => {
        window.location.href = url
      })
      .catch(() => {
        setGoogleLoading(false)
        setError('Could not start Google sign-in. Please try again.')
      })
  }

  return (
    <AuthLayout
      kicker="Get Started"
      title="Create your account"
      subtitle="Monitor uptime and latency, and get weekly SLA reports by email."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-crit/25 bg-crit/[0.06] px-3 py-2 text-[12px] text-crit animate-fade-in">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            {error}
          </div>
        )}

        <div>
          <label className="field-label" htmlFor="name">
            <span className="inline-flex items-center gap-1.5">
              <UserIcon className="h-3 w-3" strokeWidth={1.75} /> Name{' '}
              <span className="normal-case text-txt-dim">(optional)</span>
            </span>
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field"
            placeholder="Jane Doe"
          />
        </div>

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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field pr-10"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-txt-lo transition-colors hover:text-txt-hi"
            >
              {showPw ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-txt-dim">
            Min 8 characters, with an uppercase letter, a number, and a symbol.
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="confirm">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3 w-3" strokeWidth={1.75} /> Confirm password
            </span>
          </label>
          <input
            id="confirm"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="field"
            placeholder="••••••••"
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
              Create account <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </>
          )}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/[0.08]" />
        <span className="font-mono text-[10px] uppercase tracking-micro text-txt-dim">or</span>
        <div className="h-px flex-1 bg-white/[0.08]" />
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading}
        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-white/[0.1] bg-white/[0.02] font-mono text-[12px] font-semibold text-txt-mid transition-all duration-150 hover:border-white/20 hover:bg-white/[0.04] hover:text-txt-hi active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
      >
        {googleLoading ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-txt-hi" />
        ) : (
          <>
            <GoogleIcon className="h-4 w-4" /> Continue with Google
          </>
        )}
      </button>
    </AuthLayout>
  )
}

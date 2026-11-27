import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, KeyRound, Lock, Mail, Send } from 'lucide-react'
import ActionButton from '../components/ActionButton'
import AuthLayout from '../components/AuthLayout'
import CodeSlots, { type CodeSlotsStatus } from '../components/CodeSlots'
import { Alert } from '../components/ui'
import { CODE_SENDER, confirmNewPassword, forgotPassword, friendlyAuthMessage } from '../lib/cognito'

/** A Google account has no password, so Cognito refuses to reset one; say what to do instead. */
const GOOGLE_HINT = 'This address can’t reset a password. If you signed up with Google, use Continue with Google instead.'

/**
 * Two steps: ask Cognito for a code, then set a new password with it.
 * An unknown address still moves on to step two, so the page never says
 * whether an account exists.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '')
  const [step, setStep] = useState<'request' | 'confirm'>('request')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<CodeSlotsStatus>('idle')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function requestCode(again = false) {
    if (!email.trim()) {
      setError('Enter the email you signed up with.')
      return
    }
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      await forgotPassword(email.trim())
    } catch (err) {
      const { code: kind, message } = friendlyAuthMessage(err)
      if (kind !== 'UserNotFoundException') {
        setError(kind === 'InvalidParameterException' || kind === 'NotAuthorizedException' ? GOOGLE_HINT : message)
        setLoading(false)
        return
      }
    }
    setStep('confirm')
    setNotice(again ? 'Code sent again. Check spam or junk too.' : 'If an account uses that address, a code is on its way.')
    setLoading(false)
  }

  async function setNewPassword(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6) return setError('The code is six digits.')
    if (!password) return setError('Choose a new password.')
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      await confirmNewPassword(email.trim(), code, password)
      setStatus('success')
      window.setTimeout(() => navigate('/login', { state: { email: email.trim(), passwordReset: true } }), 900)
    } catch (err) {
      const { code: kind, message } = friendlyAuthMessage(err)
      setError(message)
      if (kind === 'CodeMismatchException' || kind === 'ExpiredCodeException') setStatus('error')
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      kicker="Forgot password"
      title={step === 'request' ? 'Reset your password' : 'Choose a new password'}
      subtitle={
        step === 'request'
          ? 'We’ll email you a 6-digit code to set a new one.'
          : `Enter the code we sent to ${email.trim()}, then your new password.`
      }
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" state={{ email: email.trim() }} className="font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {notice && (
        <Alert tone="success" className="mb-4 animate-fade-in">
          {notice}
        </Alert>
      )}
      {error && (
        <Alert tone="error" className="mb-4 animate-fade-in">
          {error}
        </Alert>
      )}

      {step === 'request' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            requestCode()
          }}
          className="space-y-4"
        >
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
              autoFocus
            />
          </div>
          <ActionButton
            type="submit"
            size="lg"
            fullWidth
            icon={<Send className="h-4 w-4" strokeWidth={2} />}
            state={loading ? 'loading' : 'idle'}
            labels={{ loading: 'Sending…' }}
            disabled={loading}
          >
            Send code
          </ActionButton>
          <p className="text-center text-[11.5px] leading-relaxed text-txt-lo">
            Signed up with Google? There is no password to reset: use Continue with Google.
          </p>
        </form>
      ) : (
        <form onSubmit={setNewPassword} className="space-y-4">
          <div>
            <span className="field-label">Code</span>
            <div className="flex justify-center pt-1">
              <CodeSlots
                length={6}
                value={code}
                status={status}
                disabled={loading || status === 'success'}
                autoFocus
                onChange={(next) => {
                  setCode(next)
                  if (status === 'error') setStatus('idle')
                }}
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

          <div>
            <label className="field-label" htmlFor="password">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="h-3 w-3" strokeWidth={1.75} /> New password
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
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-txt-lo transition-colors hover:text-txt-hi"
              >
                {showPw ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-txt-dim">Min 8 characters, with an uppercase letter, a number, and a symbol.</p>
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

          <ActionButton
            type="submit"
            size="lg"
            fullWidth
            icon={<KeyRound className="h-4 w-4" strokeWidth={2} />}
            state={status === 'success' ? 'success' : loading ? 'loading' : 'idle'}
            labels={{ loading: 'Saving…', success: 'Password changed' }}
            disabled={loading || status === 'success'}
          >
            Change password
          </ActionButton>

          <p className="text-center text-[12px] leading-relaxed text-txt-lo">
            No email after a minute? Check spam or junk (it comes from <span className="text-txt-mid">{CODE_SENDER}</span>), or{' '}
            <button type="button" onClick={() => requestCode(true)} disabled={loading} className="font-medium text-accent hover:underline disabled:opacity-60">
              resend the code
            </button>
            .
          </p>
        </form>
      )}
    </AuthLayout>
  )
}

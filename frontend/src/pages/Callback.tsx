import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { buildGoogleLoginUrl, setToken } from '../lib/auth'
import { hydrateProfile } from '../lib/api'
import { describeCallbackError, type CallbackFailure } from '../lib/callbackError'
import AuthLayout from '../components/AuthLayout'
import BootSplash from '../components/BootSplash'
import GoogleIcon from '../components/GoogleIcon'
import { Spinner } from '../components/ui'

export default function Callback() {
  const navigate = useNavigate()
  const [failure, setFailure] = useState<CallbackFailure | null>(null)
  // The OAuth code, verifier and state are single-use: a second effect run
  // (React StrictMode) must not consume them again.
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    async function handleCallback() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      // Read and clear both before anything else, whatever the outcome. Blocked
      // storage reads as nothing stored, so it ends on a message, not the splash.
      let codeVerifier: string | null = null
      let expectedState: string | null = null
      try {
        codeVerifier = sessionStorage.getItem('pkce_verifier')
        expectedState = sessionStorage.getItem('oauth_state')
        sessionStorage.removeItem('pkce_verifier')
        sessionStorage.removeItem('oauth_state')
      } catch {
        /* storage blocked: handled as a missing verifier below */
      }

      if (!code) {
        const error = params.get('error')
        setFailure(error ? { kind: 'provider', error, description: params.get('error_description') ?? undefined } : { kind: 'no_code' })
        return
      }
      if (!codeVerifier) return setFailure({ kind: 'no_verifier' })
      // CSRF binding (constraint F): only finish a sign-in this browser started.
      if (!expectedState || params.get('state') !== expectedState) return setFailure({ kind: 'state_mismatch' })

      const cognitoUrl = import.meta.env.VITE_COGNITO_HOSTED_UI_URL
      const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID
      const redirectUri = `${window.location.origin}/callback`

      try {
        const tokenRes = await fetch(`${cognitoUrl}/oauth2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          }),
        })

        if (!tokenRes.ok) {
          const body = await tokenRes.text().catch(() => '')
          setFailure(tokenRes.status >= 500 ? { kind: 'network', status: tokenRes.status } : { kind: 'exchange_rejected', status: tokenRes.status, body })
          return
        }

        const { id_token } = await tokenRes.json()
        setToken(id_token)
      } catch {
        setFailure({ kind: 'network' })
        return
      }

      // Best-effort: the dashboard works without a hydrated profile,
      // and Settings retries on its own.
      await hydrateProfile().catch(() => {})
      navigate('/dashboard')
    }

    handleCallback()
  }, [navigate])

  if (failure) return <CallbackError failure={failure} />
  return <BootSplash title="Signing you in" />
}

function CallbackError({ failure }: { failure: CallbackFailure }) {
  const message = describeCallbackError(failure)
  const primary = useRef<HTMLDivElement>(null)
  const [starting, setStarting] = useState(false)
  const [startFailed, setStartFailed] = useState(false)
  useEffect(() => {
    primary.current?.querySelector<HTMLElement>('button, a')?.focus()
  }, [])

  return (
    <AuthLayout title={message.title}>
      <p role="alert" className="text-[13px] leading-relaxed text-txt-mid">
        {message.body}
      </p>
      <div ref={primary} className="mt-5 space-y-2.5">
        {message.retry && (
          // The same Google button as the sign-in page: the colour mark belongs on a neutral face, not on the accent.
          <button
            type="button"
            disabled={starting}
            onClick={() => {
              setStarting(true)
              setStartFailed(false)
              // A fresh flow, never the old code: it and its verifier are spent.
              buildGoogleLoginUrl()
                .then((url) => {
                  window.location.href = url
                })
                .catch(() => {
                  setStarting(false)
                  setStartFailed(true)
                })
            }}
            className="btn-outline text-txt-hi"
          >
            {starting ? <Spinner size={16} /> : <GoogleIcon className="h-4 w-4" />}
            {startFailed ? 'Couldn’t start. Try again' : 'Try Google again'}
          </button>
        )}
        <Link
          to="/login"
          className={
            message.retry
              ? 'inline-flex h-9 w-full items-center justify-center text-[12.5px] font-medium text-txt-lo transition-colors hover:text-txt-hi'
              : 'btn-accent inline-flex h-11 w-full items-center justify-center'
          }
        >
          Back to sign in
        </Link>
      </div>
      {message.details && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[11.5px] text-txt-lo hover:text-txt-mid">Technical details</summary>
          <p className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-txt-lo">{message.details}</p>
        </details>
      )}
    </AuthLayout>
  )
}

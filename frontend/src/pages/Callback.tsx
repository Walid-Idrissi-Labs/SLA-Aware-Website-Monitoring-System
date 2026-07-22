import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { setToken } from '../lib/auth'
import { hydrateProfile } from '../lib/api'
import BootSplash from '../components/BootSplash'

export default function Callback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  // The OAuth code and PKCE verifier are single-use — a second effect run
  // (React StrictMode) must not consume them again.
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    async function handleCallback() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')

      if (!code) {
        navigate('/login')
        return
      }

      const codeVerifier = sessionStorage.getItem('pkce_verifier')
      if (!codeVerifier) {
        setError('Your sign-in session expired. Please try again.')
        return
      }
      sessionStorage.removeItem('pkce_verifier')

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
          setError('Sign-in could not be completed. Please try again.')
          return
        }

        const { id_token } = await tokenRes.json()
        setToken(id_token)
      } catch {
        setError('Could not reach the sign-in service. Check your connection and try again.')
        return
      }

      // Best-effort: the dashboard works without a hydrated profile,
      // and Settings retries on its own.
      await hydrateProfile().catch(() => {})
      navigate('/dashboard')
    }

    handleCallback()
  }, [navigate])

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center p-4">
        <div className="card flex w-full max-w-sm flex-col items-center gap-4 p-8 text-center">
          <p className="text-[14px] font-semibold text-txt-hi">Sign-in failed</p>
          <p className="text-[13px] text-txt-mid">{error}</p>
          <Link to="/login" className="btn-primary">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return <BootSplash title="Signing you in" />
}

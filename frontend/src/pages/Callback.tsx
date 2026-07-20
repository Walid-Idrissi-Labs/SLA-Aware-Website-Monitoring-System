import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { setToken } from '../lib/auth'
import { hydrateProfile } from '../lib/api'
import BootSplash from '../components/BootSplash'

export default function Callback() {
  const navigate = useNavigate()

  useEffect(() => {
    async function handleCallback() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')

      if (!code) {
        navigate('/login')
        return
      }

      const codeVerifier = sessionStorage.getItem('pkce_verifier')
      if (!codeVerifier) {
        console.error('Missing PKCE verifier')
        navigate('/login')
        return
      }
      sessionStorage.removeItem('pkce_verifier')

      const cognitoUrl = import.meta.env.VITE_COGNITO_HOSTED_UI_URL
      const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID
      const redirectUri = `${window.location.origin}/callback`

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
        console.error('Token exchange failed', await tokenRes.text())
        navigate('/login')
        return
      }

      const { id_token } = await tokenRes.json()
      setToken(id_token)
      await hydrateProfile()
      navigate('/dashboard')
    }

    handleCallback()
  }, [navigate])

  return (
    <BootSplash
      title="Establishing secure session"
      lines={['Exchanging authorization code', 'Verifying identity token', 'Loading your workspace']}
    />
  )
}

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChartNoAxesCombined } from 'lucide-react'
import { setToken, decodeToken, storeUser } from '../lib/auth'
import { getMe } from '../lib/api'
import type { User } from '../types'

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

      try {
        const user = await getMe()
        storeUser(user as unknown as User)
      } catch {
        const decoded = decodeToken(id_token)
        if (decoded) {
          const minimalUser: User = {
            user_id: decoded.sub,
            email: decoded.email || '',
            display_name: decoded.name || decoded.email?.split('@')[0] || 'User',
            notification_email: decoded.email || '',
            created_at: new Date().toISOString(),
          }
          storeUser(minimalUser)
        }
      }

      navigate('/dashboard')
    }

    handleCallback()
  }, [navigate])

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono">
      <div className="text-center">
        <div className="w-8 h-8 bg-[#fa5c29] flex items-center justify-center mx-auto mb-3 animate-pulse">
          <ChartNoAxesCombined className="w-4 h-4 text-white" strokeWidth={2.5} />
        </div>
        <p className="text-[11px] text-[#6b6b73] uppercase tracking-widest">Exchanging token...</p>
        <p className="text-[9px] text-[#3f3f46] mt-2">PKCE flow in progress</p>
      </div>
    </div>
  )
}
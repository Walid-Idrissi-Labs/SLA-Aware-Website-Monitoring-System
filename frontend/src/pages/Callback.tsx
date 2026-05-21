import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { setToken, decodeToken, storeUser } from '../lib/auth'
import { getMe } from '../lib/api'
import type { User } from '../types'

export default function Callback() {
  const navigate = useNavigate()

  useEffect(() => {
    async function handleCallback() {
      const hash = window.location.hash.slice(1)
      const params = new URLSearchParams(hash)
      const idToken = params.get('id_token')

      if (!idToken) {
        navigate('/login')
        return
      }

      setToken(idToken)

      try {
        const user = await getMe()
        storeUser(user as unknown as User)
      } catch {
        const decoded = decodeToken(idToken)
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
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 bg-theme-orange rounded-sm flex items-center justify-center mx-auto mb-4 glow-orange animate-pulse">
          <span className="material-symbols-outlined text-surface-container-lowest text-sm font-bold">monitoring</span>
        </div>
        <p className="font-mono text-sm text-on-surface-variant">Authenticating...</p>
      </div>
    </div>
  )
}
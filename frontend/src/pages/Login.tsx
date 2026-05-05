import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAuthenticated, buildLoginUrl } from '../lib/auth'

export default function Login() {
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated()) {
      navigate('/dashboard', { replace: true })
      return
    }
    window.location.href = buildLoginUrl()
  }, [navigate])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 bg-theme-orange rounded-sm flex items-center justify-center mx-auto mb-4 glow-orange">
          <span className="material-symbols-outlined text-surface-container-lowest text-lg font-bold">monitoring</span>
        </div>
        <p className="font-mono text-sm text-on-surface-variant">Redirecting to login...</p>
      </div>
    </div>
  )
}
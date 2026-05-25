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
    buildLoginUrl().then((url) => {
      window.location.href = url
    })
  }, [navigate])

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono">
      <div className="text-center">
        <div className="w-10 h-10 bg-[#fa5c29] flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p className="text-[11px] text-[#6b6b73] uppercase tracking-widest">Authenticating...</p>
        <p className="text-[9px] text-[#3f3f46] mt-2">Redirecting to Cognito</p>
      </div>
    </div>
  )
}
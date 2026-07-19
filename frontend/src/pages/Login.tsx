import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAuthenticated, buildLoginUrl } from '../lib/auth'
import BootSplash from '../components/BootSplash'

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
    <BootSplash
      title="Redirecting to secure sign-in"
      lines={['Initializing session', 'Generating PKCE challenge', 'Handing off to Cognito']}
    />
  )
}

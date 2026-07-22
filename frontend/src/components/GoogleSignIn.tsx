import { useState } from 'react'
import GoogleIcon from './GoogleIcon'
import { Spinner } from './ui'
import { buildGoogleLoginUrl } from '../lib/auth'

interface Props {
  onError: (message: string) => void
}

/** "or" divider + Google OAuth button, shared by the Login and Signup pages. */
export default function GoogleSignIn({ onError }: Props) {
  const [loading, setLoading] = useState(false)

  function handleClick() {
    setLoading(true)
    buildGoogleLoginUrl()
      .then((url) => {
        window.location.href = url
      })
      .catch(() => {
        setLoading(false)
        onError('Could not start Google sign-in. Please try again.')
      })
  }

  return (
    <>
      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-edge" />
        <span className="text-[12px] text-txt-lo">or</span>
        <div className="h-px flex-1 bg-edge" />
      </div>

      <button type="button" onClick={handleClick} disabled={loading} className="btn-secondary h-10 w-full">
        {loading ? (
          <Spinner size={16} />
        ) : (
          <>
            <GoogleIcon className="h-4 w-4" /> Continue with Google
          </>
        )}
      </button>
    </>
  )
}

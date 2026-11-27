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
        <div className="h-px flex-1 bg-white/[0.08]" />
        <span className="text-[11px] text-txt-dim">or</span>
        <div className="h-px flex-1 bg-white/[0.08]" />
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="btn-outline"
      >
        {loading ? (
          <Spinner size={16} />
        ) : (
          <>
            <GoogleIcon className="h-4 w-4" /> Continue with Google
          </>
        )}
      </button>
      {/* Decision E: the two never merge, so say it where people choose. */}
      <p className="mt-2 text-center text-[11.5px] leading-relaxed text-txt-lo">
        Google and email-password sign-ins are separate accounts, even on the same address.
      </p>
    </>
  )
}

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
        <span className="font-mono text-[10px] uppercase tracking-micro text-txt-dim">or</span>
        <div className="h-px flex-1 bg-white/[0.08]" />
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-white/[0.1] bg-white/[0.02] font-mono text-[12px] font-semibold text-txt-mid transition-all duration-150 hover:border-white/20 hover:bg-white/[0.04] hover:text-txt-hi active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
      >
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

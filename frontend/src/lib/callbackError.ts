/** Why a Google sign-in failed to complete at /callback, and what to tell the person (board #22). */
export type CallbackFailure =
  /** Cognito or Google sent ?error= instead of a code. */
  | { kind: 'provider'; error: string; description?: string }
  /** Opened directly, with neither a code nor an error. */
  | { kind: 'no_code' }
  /** The PKCE verifier is gone: another tab or browser, or storage was cleared. */
  | { kind: 'no_verifier' }
  /** The `state` that came back is not the one this browser sent. */
  | { kind: 'state_mismatch' }
  /** The token endpoint refused the code (4xx). */
  | { kind: 'exchange_rejected'; status: number; body?: string }
  /** No answer, or a 5xx, from the token endpoint. */
  | { kind: 'network'; status?: number }

export interface CallbackMessage {
  title: string
  body: string
  /** Offer "Try Google again" (a fresh flow; the old code and verifier are spent). */
  retry: boolean
  /** The raw reason, for a collapsed "Technical details". Never a code or a token. */
  details?: string
}

const cap = (text: string) => (text.length > 200 ? `${text.slice(0, 200)}…` : text)

export function describeCallbackError(failure: CallbackFailure): CallbackMessage {
  switch (failure.kind) {
    case 'provider': {
      const details = cap(failure.description ? `${failure.error}: ${failure.description}` : failure.error)
      if (failure.error === 'access_denied') return { title: 'Sign-in cancelled', body: 'You left Google before finishing. Nothing was changed.', retry: true, details }
      if (failure.error === 'server_error' || failure.error === 'temporarily_unavailable')
        return { title: 'Sign-in didn’t finish', body: 'The sign-in service had a problem. Try again in a moment.', retry: true, details }
      return { title: 'Sign-in didn’t finish', body: 'Google sign-in couldn’t be completed. Try again, or use your email and password.', retry: true, details }
    }
    case 'no_code':
      return { title: 'Nothing to finish', body: 'This page completes a Google sign-in, and none is in progress.', retry: false }
    case 'no_verifier':
      return { title: 'Sign-in didn’t finish', body: 'This sign-in was started in another tab or browser, or it timed out. Start it again from here.', retry: true }
    case 'state_mismatch':
      return { title: 'Sign-in stopped', body: 'This response doesn’t match a sign-in started in this browser, so we stopped it. Start again from here.', retry: true }
    case 'exchange_rejected':
      return { title: 'Sign-in didn’t finish', body: 'This sign-in was already used or has expired. Start again.', retry: true, details: cap(`HTTP ${failure.status}${failure.body ? ` · ${failure.body}` : ''}`) }
    case 'network':
      return { title: 'Can’t reach sign-in', body: 'Check your connection and try again.', retry: true, details: failure.status ? `HTTP ${failure.status}` : undefined }
  }
}

/**
 * Direct integration with the existing Cognito User Pool.
 *
 * This is the "wiring" layer: it points the Cognito SDK at YOUR pool + app client
 * (via public, non-secret identifiers) and exposes the handful of operations the
 * custom login/signup UI needs. No backend, Terraform, or Cognito config changes —
 * the app client already permits SRP sign-in, self sign-up, and email-code confirmation.
 *
 * Email/password uses SRP: the password is never sent over the wire, even encrypted.
 */
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js'

// The pool is created lazily on first use so that a missing env var surfaces as a
// friendly error inside a handler rather than crashing the whole app at import time.
let pool: CognitoUserPool | null = null

function getPool(): CognitoUserPool {
  if (pool) return pool
  const UserPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID
  const ClientId = import.meta.env.VITE_COGNITO_CLIENT_ID
  if (!UserPoolId || !ClientId) {
    throw new Error(
      'Sign-in is not configured. Missing VITE_COGNITO_USER_POOL_ID / VITE_COGNITO_CLIENT_ID.'
    )
  }
  pool = new CognitoUserPool({ UserPoolId, ClientId })
  return pool
}

function cognitoUser(email: string): CognitoUser {
  // With `username_attributes = ["email"]` on the pool, the email IS the sign-in
  // identifier for every operation (sign-up, confirm, authenticate).
  return new CognitoUser({ Username: email, Pool: getPool() })
}

/**
 * Maps raw Cognito exceptions to a short, human message plus a stable `code`
 * the UI can branch on (e.g. route an unconfirmed user to the verification step).
 */
export function friendlyAuthMessage(err: unknown): { code: string; message: string } {
  const e = err as { code?: string; name?: string; message?: string } | null
  const code = e?.code || e?.name || 'UnknownError'
  switch (code) {
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
      // Deliberately identical to avoid leaking whether an account exists.
      return { code, message: 'Incorrect email or password.' }
    case 'UserNotConfirmedException':
      return { code, message: 'Your email isn’t verified yet — enter the code we sent you.' }
    case 'UsernameExistsException':
      return { code, message: 'An account with this email already exists.' }
    case 'InvalidPasswordException':
      return { code, message: e?.message || 'Password does not meet the requirements.' }
    case 'InvalidParameterException':
      return { code, message: e?.message || 'Please check the details you entered.' }
    case 'CodeMismatchException':
      return { code, message: 'That code is incorrect. Check it and try again.' }
    case 'ExpiredCodeException':
      return { code, message: 'That code has expired. Request a new one below.' }
    case 'CodeDeliveryFailureException':
      return { code, message: 'We couldn’t send the verification email. Try again shortly.' }
    case 'LimitExceededException':
    case 'TooManyRequestsException':
      return { code, message: 'Too many attempts. Please wait a moment and try again.' }
    case 'PasswordResetRequiredException':
      return { code, message: 'A password reset is required for this account.' }
    default:
      return { code, message: e?.message || 'Something went wrong. Please try again.' }
  }
}

/** Email/password sign-in via SRP. Resolves the ID token (JWT) on success. */
export function signIn(email: string, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const user = cognitoUser(email)
    const details = new AuthenticationDetails({ Username: email, Password: password })
    user.authenticateUser(details, {
      onSuccess: (session) => resolve(session.getIdToken().getJwtToken()),
      onFailure: (err) => reject(err),
      // Only reachable for admin-created accounts; self sign-up users never hit this.
      newPasswordRequired: () =>
        reject({
          code: 'NewPasswordRequired',
          message: 'This account must set a new password before signing in.',
        }),
    })
  })
}

/** Registers a new account. Cognito emails a verification code afterward. */
export function signUp(email: string, password: string, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // `email` is supplied as the username; do NOT also pass it as an attribute
    // (the pool uses email as the username attribute). Only `name` is a real attribute.
    const attributes = name.trim()
      ? [new CognitoUserAttribute({ Name: 'name', Value: name.trim() })]
      : []
    getPool().signUp(email, password, attributes, [], (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

/** Confirms a new account with the 6-digit code Cognito emailed. */
export function confirmSignUp(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cognitoUser(email).confirmRegistration(code.trim(), true, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

/** Re-sends the verification code for an unconfirmed account. */
export function resendConfirmationCode(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cognitoUser(email).resendConfirmationCode((err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

/** Clears any session the Cognito SDK cached in localStorage (used on logout). */
export function signOutLocal(): void {
  getPool().getCurrentUser()?.signOut()
}

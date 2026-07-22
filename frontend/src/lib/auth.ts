import { generateRandomString, generateCodeChallenge } from './PKCE-helpers';
import { signOutLocal } from './cognito';

const TOKEN_KEY = 'id_token';
const USER_KEY = 'user';

interface CognitoUser {
  sub: string;
  email?: string;
  name?: string;
  email_verified?: boolean;
  'cognito:username'?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  aud?: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function decodeToken(token: string): CognitoUser | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;
  return Date.now() >= decoded.exp * 1000;
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  if (isTokenExpired(token)) {
    clearToken();
    return false;
  }
  return true;
}

/**
 * Direct Google sign-in: jumps straight to Google's consent screen (skips the
 * Cognito page) via the OAuth authorize endpoint with identity_provider=Google.
 * The returned `code` is handled by the existing Callback page — unchanged.
 */
export async function buildGoogleLoginUrl(): Promise<string> {
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const redirectUri = `${window.location.origin}/callback`;
  const cognitoUrl = import.meta.env.VITE_COGNITO_HOSTED_UI_URL;

  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  sessionStorage.setItem('pkce_verifier', codeVerifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: redirectUri,
    identity_provider: 'Google',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${cognitoUrl}/oauth2/authorize?${params.toString()}`;
}

export function logout(): void {
  // Clear our token + the SDK's cached session. No hosted-UI round-trip needed
  // for password sign-ins; the user simply returns to the custom /login page.
  try {
    signOutLocal();
  } catch {
    /* pool may be unconfigured; the local token clear below is what matters */
  }
  clearToken();
  window.location.href = '/login';
}

export function storeUser(user: unknown): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): unknown {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
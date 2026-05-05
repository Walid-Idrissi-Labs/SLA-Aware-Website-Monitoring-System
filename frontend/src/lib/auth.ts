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

export function decodeToken(token: string): CognitoUser | null {
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

export function isTokenExpired(token: string): boolean {
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

export function getCognitoUserId(): string | null {
  const token = getToken();
  if (!token) return null;
  const decoded = decodeToken(token);
  return decoded?.sub ?? null;
}

export function buildLoginUrl(): string {
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const redirectUri = `${window.location.origin}/callback`;
  const cognitoUrl = import.meta.env.VITE_COGNITO_HOSTED_UI_URL;
  return `${cognitoUrl}/login?client_id=${clientId}&response_type=token&scope=openid+email+profile&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

export function logout(): void {
  clearToken();
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const logoutUri = `${window.location.origin}/login`;
  const cognitoUrl = import.meta.env.VITE_COGNITO_HOSTED_UI_URL;
  window.location.href = `${cognitoUrl}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
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
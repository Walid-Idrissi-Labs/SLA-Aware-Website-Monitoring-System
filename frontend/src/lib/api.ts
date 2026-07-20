import { getToken, storeUser, decodeToken } from './auth';
import type {
  User,
  Project,
  ProjectStatus,
  ProjectReport,
  CreateProjectInput,
  UpdateProjectInput,
} from '../types';

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL;

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export function getMe(): Promise<User> {
  return request<User>('GET', '/me');
}

export function putMe(data: { display_name?: string; notification_email?: string }): Promise<User> {
  return request<User>('PUT', '/me', data);
}

export function postMe(): Promise<User> {
  return request<User>('POST', '/me');
}

/**
 * Load the app profile for the just-authenticated user, creating it server-side
 * on first login (POST /me is idempotent). Falls back to a token-derived profile
 * only if the API is unreachable, so the app still renders either way.
 * Persists to localStorage and returns the resulting profile.
 */
export async function hydrateProfile(): Promise<User> {
  try {
    const user = await getMe();
    storeUser(user);
    return user;
  } catch {
    // No profile yet (first login) or a transient read error — bootstrap it.
    try {
      const created = await postMe();
      storeUser(created);
      return created;
    } catch {
      const token = getToken();
      const decoded = token ? decodeToken(token) : null;
      const email = decoded?.email || '';
      const fallback: User = {
        user_id: decoded?.sub || '',
        email,
        display_name: decoded?.name || email.split('@')[0] || 'User',
        notification_email: email,
        created_at: new Date().toISOString(),
      };
      storeUser(fallback);
      return fallback;
    }
  }
}

export function getProject(projectId: string): Promise<Project> {
  return request<Project>('GET', `/projects/${projectId}`)
}

export function getProjects(): Promise<Project[]> {
  return request<Project[]>('GET', '/projects')
}

export function createProject(data: CreateProjectInput): Promise<Project> {
  return request<Project>('POST', '/projects', data);
}

export function updateProject(projectId: string, data: UpdateProjectInput): Promise<Project> {
  return request<Project>('PUT', `/projects/${projectId}`, data);
}

export function deleteProject(projectId: string): Promise<void> {
  return request<void>('DELETE', `/projects/${projectId}`);
}

export function getProjectStatus(projectId: string, hours = 24): Promise<ProjectStatus> {
  return request<ProjectStatus>('GET', `/projects/${projectId}/status?hours=${hours}`);
}

export function getProjectReports(projectId: string): Promise<ProjectReport[]> {
  return request<ProjectReport[]>('GET', `/projects/${projectId}/reports`);
}
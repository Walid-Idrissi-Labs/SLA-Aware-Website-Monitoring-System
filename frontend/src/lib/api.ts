import { getToken, clearToken, storeUser } from './auth';
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
  if (!API_BASE) {
    throw new Error('VITE_API_GATEWAY_URL is not configured');
  }
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

  // Expired or revoked session: stop polling with a dead token and
  // send the user back to sign in.
  if (res.status === 401) {
    clearToken();
    window.location.assign('/login');
    throw new Error('Session expired');
  }

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed (${res.status})`);
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
 * on first login (POST /me is idempotent). Persists to localStorage and returns
 * the profile. Throws if the API is unreachable — callers decide how to degrade.
 */
export async function hydrateProfile(): Promise<User> {
  let user: User;
  try {
    user = await getMe();
  } catch {
    // No profile yet (first login) or a transient read error — bootstrap it.
    user = await postMe();
  }
  storeUser(user);
  return user;
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

export function generateReport(
  projectId: string,
  days: number
): Promise<{ message: string; report_id?: string; days: number }> {
  return request('POST', `/projects/${projectId}/reports`, { days });
}

export function getReportDownloadUrl(
  projectId: string,
  reportId: string,
  format: 'html' | 'json'
): Promise<{ url: string; expires_in: number }> {
  return request(
    'GET',
    `/projects/${projectId}/reports/${encodeURIComponent(reportId)}/download?format=${format}`
  );
}
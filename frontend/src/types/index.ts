export interface User {
  user_id: string;
  email: string;
  display_name: string;
  notification_email: string;
  created_at: string;
}

/** Coarse failure cause recorded per check / incident by the backend.
 *  Absent on legacy rows written before it was captured. */
export type ErrorType = 'timeout' | 'dns' | 'conn' | 'tls' | 'http';

export interface Project {
  project_id: string;
  name: string;
  url: string;
  active: boolean;
  failure_threshold: number;
  thresholds: {
    min_uptime_pct: number;
    max_avg_latency_ms: number;
  };
  notification_email: string;
  created_at: string;
  /** 'unknown' (or absent) until the first check lands. */
  current_status?: 'success' | 'failure' | 'unknown';
  last_latency_ms?: number | null;
  /** Epoch milliseconds of the most recent check. */
  last_checked_at?: number | null;
  /** TLS cert state, cached on the project row by the Monitor Lambda.
   *  Absent for http:// endpoints or until the first cert probe lands. */
  cert_expiry_days?: number | null;
  cert_issuer?: string | null;
  cert_checked_at?: number | null;
}

export interface Check {
  timestamp: number;
  status: 'success' | 'failure';
  latency_ms: number;
  http_status_code: number;
  error_type?: ErrorType | null;
}

export interface Incident {
  project_id: string;
  /** Epoch SECONDS (note: checks use epoch ms). */
  start_time: number;
  end_time: number | null;
  duration_seconds: number | null;
  resolved: boolean;
  cause?: ErrorType | null;
}

export interface ErrorBudget {
  min_uptime_pct: number;
  allowed_downtime_sec: number;
  consumed_downtime_sec: number;
  remaining_sec: number;
  burn_pct: number;
  ok: boolean;
}

export interface ReliabilityMetrics {
  incident_count: number;
  open_incident: boolean;
  mttr_sec: number;
  mtbf_sec: number | null;
  longest_outage_sec: number;
  total_downtime_sec: number;
  downtime_pct: number;
  error_budget: ErrorBudget;
}

export interface IncidentsResponse {
  project_id: string;
  window_days: number;
  incidents: Incident[];
  metrics: ReliabilityMetrics;
}

export interface ProjectStatus {
  project_id: string;
  current_status: 'success' | 'failure' | 'unknown';
  checks: Check[];
}

export interface ProjectReport {
  project_id: string;
  report_id: string;
  uptime_pct: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  incident_count: number;
  total_downtime_sec: number;
  severity: 'healthy' | 'degraded' | 'major' | 'critical';
  sla_pass: boolean;
  generated_at: string;
}

export interface CreateProjectInput {
  name: string;
  url: string;
  failure_threshold?: number;
  thresholds?: {
    min_uptime_pct: number;
    max_avg_latency_ms: number;
  };
  notification_email?: string;
}

export interface UpdateProjectInput {
  name?: string;
  url?: string;
  active?: boolean;
  failure_threshold?: number;
  thresholds?: {
    min_uptime_pct: number;
    max_avg_latency_ms: number;
  };
  notification_email?: string;
}
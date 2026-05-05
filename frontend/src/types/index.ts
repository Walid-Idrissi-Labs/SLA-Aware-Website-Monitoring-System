export interface User {
  user_id: string;
  email: string;
  display_name: string;
  notification_email: string;
  created_at: string;
}

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
  current_status?: 'success' | 'failure';
  last_latency_ms?: number;
  last_checked_at?: string;
}

export interface Check {
  timestamp: number;
  status: 'success' | 'failure';
  latency_ms: number;
  http_status_code: number;
}

export interface ProjectStatus {
  project_id: string;
  current_status: 'success' | 'failure';
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
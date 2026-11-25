export interface User {
  user_id: string;
  email: string;
  display_name: string;
  notification_email: string;
  created_at: string;
}

/** Coarse failure cause recorded per check / incident by the backend.
 *  `blocked` means the probe was challenged (WAF/CAPTCHA), not that the site
 *  failed. Absent on legacy rows written before it was captured. */
export type ErrorType = 'timeout' | 'dns' | 'conn' | 'tls' | 'http' | 'blocked';

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
  /** HTTP statuses this monitor treats as up, e.g. "200-399" (or "200-399,404").
   *  Absent on projects created before the field existed; the backend then
   *  applies the same default. */
  accepted_status?: string;
  /** 'unknown' (or absent) until the first check lands. */
  current_status?: 'success' | 'failure' | 'inconclusive' | 'unknown';
  last_latency_ms?: number | null;
  /** Epoch milliseconds of the most recent check. */
  last_checked_at?: number | null;
  /** TLS cert state, cached on the project row by the Monitor Lambda.
   *  Absent for http:// endpoints or until the first cert probe lands. */
  cert_expiry_days?: number | null;
  cert_issuer?: string | null;
  cert_checked_at?: number | null;
  /** Only when fetched with getProjects(statusHours). */
  status?: ProjectStatus;
}

export interface Check {
  timestamp: number;
  /** success = up, failure = down, inconclusive = the check produced no usable
   *  evidence (bot challenge, probe-side error). Only success and failure count
   *  toward uptime. */
  status: 'success' | 'failure' | 'inconclusive';
  latency_ms: number;
  http_status_code: number;
  error_type?: ErrorType | null;
  /** Snapshot of the accepted-status rule that judged this check. */
  accepted_status?: string;
}

export interface Incident {
  project_id: string;
  /** Epoch SECONDS (note: checks use epoch ms). */
  start_time: number;
  end_time: number | null;
  duration_seconds: number | null;
  resolved: boolean;
  cause?: ErrorType | null;
  /** Set when it was closed without an observed recovery: the project stopped
   *  being monitored (deleted or paused) while it was still down. */
  closed_reason?: 'monitoring_stopped' | null;
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

export interface StatusSummary {
  window_hours: number;
  checks_total: number;
  checks_up: number;
  checks_down: number;
  checks_inconclusive: number;
  /** Checks the 1-minute schedule should have produced in this window. */
  checks_expected: number;
  /** Conclusive-only uptime. `null` means no conclusive checks at all, which is
   *  not the same claim as 0%. */
  uptime_pct: number | null;
  /** Share of expected checks that produced a verdict (0–100). */
  coverage_pct: number;
}

/** One UTC day of a monitor's history. */
export interface DailyTally {
  /** UTC date, "YYYY-MM-DD". */
  date: string;
  up: number;
  down: number;
  inconclusive: number;
  /** Seconds of confirmed outage (incidents) inside this UTC day. */
  outage_sec: number;
}

export interface Daily {
  /** First UTC day the monitor tallied, or null before it has tallied any. */
  since: string | null;
  /** Oldest first, one entry per day. */
  days: DailyTally[];
}

export interface ProjectStatus {
  project_id: string;
  current_status: 'success' | 'failure' | 'inconclusive' | 'unknown';
  summary?: StatusSummary;
  checks: Check[];
  /** 30 days on /status, 14 on the dashboard list. Absent before the API serves it. */
  daily?: Daily;
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
  /** Three-valued SLO verdict. 'unproven' means too little evidence to judge.
   *  Absent on reports generated before the field existed. */
  slo_status?: 'met' | 'missed' | 'unproven';
  coverage_pct?: number;
  checks_total?: number;
  checks_up?: number;
  checks_down?: number;
  checks_inconclusive?: number;
  checks_expected?: number;
  generated_at: string;
}

export interface CreateProjectInput {
  name: string;
  url: string;
  accepted_status?: string;
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
  accepted_status?: string;
  failure_threshold?: number;
  thresholds?: {
    min_uptime_pct: number;
    max_avg_latency_ms: number;
  };
  notification_email?: string;
}
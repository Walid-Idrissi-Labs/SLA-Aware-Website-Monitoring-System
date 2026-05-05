import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import TopNav from '../components/TopNav'
import LatencyChart from '../components/LatencyChart'
import { getProject, getProjectStatus, getProjectReports } from '../lib/api'
import type { ProjectStatus, ProjectReport, Project } from '../types'

const SEVERITY_LABELS: Record<string, string> = {
  healthy: 'HEALTHY',
  degraded: 'DEGRADED',
  major: 'MAJOR',
  critical: 'CRITICAL',
}

const SEVERITY_COLORS: Record<string, string> = {
  healthy: 'status-healthy',
  degraded: 'status-degraded',
  major: 'status-major',
  critical: 'status-critical',
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [status, setStatus] = useState<ProjectStatus | null>(null)
  const [reports, setReports] = useState<ProjectReport[]>([])
  const [loading, setLoading] = useState(true)
  const [hours, setHours] = useState(24)

  async function loadData() {
    if (!id) return
    setLoading(true)
    try {
      const [projectData, statusData, reportsData] = await Promise.all([
        getProject(id),
        getProjectStatus(id, hours),
        getProjectReports(id),
      ])
      setProject(projectData)
      setStatus(statusData)
      setReports(reportsData)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id, hours])

  const latestCheck = status?.checks[0]
  const isUp = status?.current_status === 'success'

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 max-w-container-max mx-auto px-margin-page py-6 w-full">
        <div className="mb-6 border-b border-outline-variant/30 pb-6">
          <nav className="flex items-center gap-2 text-[10px] font-mono text-on-surface-variant uppercase tracking-tighter mb-2">
            <button onClick={() => navigate('/dashboard')} className="hover:text-theme-orange cursor-pointer">ROOT</button>
            <span className="material-symbols-outlined text-[10px]">chevron_right</span>
            <button onClick={() => navigate('/dashboard')} className="hover:text-theme-orange cursor-pointer">PROJECTS</button>
            <span className="material-symbols-outlined text-[10px]">chevron_right</span>
            <span className="text-theme-orange">{project?.name || '...'}</span>
          </nav>
          <h1 className="font-headline-lg text-3xl tracking-tighter text-on-surface font-mono uppercase">{project?.name || 'Loading...'}</h1>
          <div className="flex items-center gap-4 mt-2">
            <span className="font-mono text-xs text-on-surface-variant">URL: <span className="text-on-surface">{project?.url || '—'}</span></span>
            <div className={`flex items-center gap-1.5 px-2 py-0.5 ${isUp ? 'bg-status-healthy/10 text-status-healthy border border-status-healthy/30' : 'bg-status-critical/10 text-status-critical border border-status-critical/30'} rounded text-[10px] font-bold uppercase tracking-widest font-mono`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isUp ? 'bg-status-healthy animate-pulse' : 'bg-status-critical animate-pulse'}`}></span>
              {isUp ? 'UP' : 'DOWN'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
          <div className="lg:col-span-4 bg-surface-container-low border border-outline-variant p-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-mono text-sm text-on-surface uppercase tracking-widest font-bold">Latency Analytics ({hours}H)</h3>
                <p className="font-mono text-[10px] text-on-surface-variant">Real-time performance distribution</p>
              </div>
              <div className="flex gap-2">
                {[1, 24, 72].map((h) => (
                  <button
                    key={h}
                    onClick={() => setHours(h)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
                      hours === h
                        ? 'bg-theme-orange/20 text-theme-orange border border-theme-orange/30'
                        : 'bg-surface-container-high text-on-surface-variant border border-outline-variant hover:border-theme-orange/30'
                    }`}
                  >
                    {h}H
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <div className="h-48 flex items-center justify-center">
                <span className="material-symbols-outlined text-theme-orange animate-spin">progress_activity</span>
              </div>
            ) : (
              <LatencyChart checks={status?.checks || []} />
            )}
          </div>

          <div className="bg-surface-container-high border-l-4 border-l-theme-orange p-4 flex flex-col justify-between hover:bg-surface-container-highest transition-colors">
            <div className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest">Latency_Current</div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-on-surface tracking-tighter font-mono">
                {latestCheck?.latency_ms ?? '—'}<span className="text-xs font-normal text-on-surface-variant ml-1">MS</span>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-high border-l-4 border-l-primary p-4 flex flex-col justify-between hover:bg-surface-container-highest transition-colors">
            <div className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest">Current_Status</div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-on-surface tracking-tighter font-mono">{isUp ? 'UP' : 'DOWN'}</div>
            </div>
          </div>

          <div className="bg-surface-container-high border-l-4 border-l-tertiary p-4 flex flex-col justify-between hover:bg-surface-container-highest transition-colors">
            <div className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest">Incident_Count</div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-on-surface tracking-tighter font-mono">{reports.length}</div>
            </div>
          </div>

          <div className="bg-surface-container-high border-l-4 border-l-outline p-4 flex flex-col justify-between hover:bg-surface-container-highest transition-colors">
            <div className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest">Last_Checked</div>
            <div className="flex items-baseline gap-2">
              <div className="text-lg font-bold text-on-surface tracking-tighter font-mono">
                {latestCheck ? new Date(latestCheck.timestamp).toLocaleTimeString() : '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-low border border-outline-variant scanline overflow-hidden">
          <div className="px-4 py-3 border-b border-outline-variant flex justify-between items-center bg-surface-container">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-theme-orange">analytics</span>
              <h3 className="font-mono text-sm text-on-surface uppercase tracking-widest font-bold">SLA_REPORTS_HISTORY</h3>
            </div>
          </div>

          {reports.length === 0 && !loading && (
            <div className="px-4 py-8 text-center text-on-surface-variant font-mono text-sm">No reports generated yet.</div>
          )}

          {reports.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-[11px]">
                <thead>
                  <tr className="bg-surface-container-high border-b border-outline-variant">
                    <th className="px-4 py-2 text-outline-variant uppercase font-semibold">Report_ID</th>
                    <th className="px-4 py-2 text-outline-variant uppercase font-semibold">Uptime_%</th>
                    <th className="px-4 py-2 text-outline-variant uppercase font-semibold">Latency_Avg</th>
                    <th className="px-4 py-2 text-outline-variant uppercase font-semibold">P95_Latency</th>
                    <th className="px-4 py-2 text-outline-variant uppercase font-semibold">Incidents</th>
                    <th className="px-4 py-2 text-outline-variant uppercase font-semibold">Severity</th>
                    <th className="px-4 py-2 text-outline-variant uppercase font-semibold">SLA_Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {reports.map((report) => (
                    <tr key={report.report_id} className="hover:bg-surface-container-high/50 transition-all group border-l-2 border-l-transparent hover:border-l-theme-orange">
                      <td className="px-4 py-2 text-on-surface group-hover:text-theme-orange">{report.report_id}</td>
                      <td className="px-4 py-2 text-on-surface font-mono">{report.uptime_pct.toFixed(2)}%</td>
                      <td className="px-4 py-2 text-on-surface font-mono">{report.avg_latency_ms}ms</td>
                      <td className="px-4 py-2 text-on-surface font-mono">{report.p95_latency_ms}ms</td>
                      <td className="px-4 py-2 text-on-surface font-mono">{report.incident_count}</td>
                      <td className="px-4 py-2">
                        <span className={`px-1.5 py-0.5 border text-[9px] font-bold font-mono ${SEVERITY_COLORS[report.severity] === 'status-healthy' ? 'border-status-healthy/30 bg-status-healthy/10 text-status-healthy' : SEVERITY_COLORS[report.severity] === 'status-degraded' ? 'border-status-degraded/30 bg-status-degraded/10 text-status-degraded' : SEVERITY_COLORS[report.severity] === 'status-major' ? 'border-status-major/30 bg-status-major/10 text-status-major' : 'border-status-critical/30 bg-status-critical/10 text-status-critical'}`}>
                          {SEVERITY_LABELS[report.severity]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {report.sla_pass ? (
                          <span className="text-status-healthy font-bold flex items-center justify-end gap-1">
                            <span className="material-symbols-outlined text-sm">check_small</span> PASS
                          </span>
                        ) : (
                          <span className="text-status-critical font-bold flex items-center justify-end gap-1">
                            <span className="material-symbols-outlined text-sm">close</span> FAIL
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
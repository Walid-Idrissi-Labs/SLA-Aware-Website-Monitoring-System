import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Plus, Radar } from 'lucide-react'
import Shell from '../components/Shell'
import TickerStat from '../components/TickerStat'
import ProjectCard from '../components/ProjectCard'
import AddProjectModal from '../components/AddProjectModal'
import MagicBento, { type MagicBentoItem } from '../components/MagicBento'
import Counter from '../components/Counter'
import { BentoFigure, BentoArea, BentoBars, BentoTiles, BentoSteps } from '../components/BentoVisuals'
import ActionButton from '../components/ActionButton'
import { Alert } from '../components/ui'
import { getProjects, getProjectStatus } from '../lib/api'
import { POLL_INTERVAL_MS, STATUS } from '../lib/format'
import type { Check, Project, ProjectStatus } from '../types'

/** Consecutive failures at the end of the check list, newest first. */
function failureStreak(checks: Check[]): number {
  const sorted = [...checks].sort((a, b) => b.timestamp - a.timestamp)
  let streak = 0
  for (const check of sorted) {
    if (check.status === 'inconclusive') continue
    if (check.status === 'failure') streak += 1
    else break
  }
  return streak
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [statuses, setStatuses] = useState<Record<string, ProjectStatus>>({})
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const requestSeq = useRef(0)
  const navigate = useNavigate()

  const loadProjects = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    try {
      const data = await getProjects()
      const results = await Promise.allSettled(data.map((p) => getProjectStatus(p.project_id, 1)))
      if (seq !== requestSeq.current) return // a newer request superseded this one
      const statusMap: Record<string, ProjectStatus> = {}
      results.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          statusMap[data[i].project_id] = res.value
        }
      })
      setProjects(data)
      setStatuses(statusMap)
      setError(null)
      setLoaded(true)
    } catch (e) {
      if (seq !== requestSeq.current) return
      // Keep whatever is already on screen — a failed background poll
      // shouldn't wipe a working dashboard.
      setError(e instanceof Error ? e.message : 'Failed to load projects')
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    const intervalId = window.setInterval(() => loadProjects(), POLL_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [loadProjects])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadProjects()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [loadProjects])

  const activeProjects = useMemo(() => projects.filter((p) => p.active), [projects])
  const total = activeProjects.length
  // A project with no checks yet is "pending", not down.
  const checked = activeProjects.filter((p) => p.current_status === 'success' || p.current_status === 'failure')
  const healthy = checked.filter((p) => p.current_status === 'success').length
  const withLatency = activeProjects.filter((p) => p.last_latency_ms != null)
  const avgLatency =
    withLatency.length > 0
      ? Math.round(withLatency.reduce((sum, p) => sum + (p.last_latency_ms || 0), 0) / withLatency.length)
      : null
  const incidents = checked.filter((p) => p.current_status === 'failure').length
  const healthPct = checked.length > 0 ? (healthy / checked.length) * 100 : null

  /** One bucket per minute across every endpoint: the pass rate and the mean
   *  latency for that minute. Inconclusive checks are excluded from both — an
   *  unanswered probe is not a slow one. */
  const timeline = useMemo(() => {
    const buckets = new Map<number, { up: number; conclusive: number; latency: number; measured: number }>()
    for (const project of activeProjects) {
      for (const check of statuses[project.project_id]?.checks ?? []) {
        const minute = Math.floor(check.timestamp / 60_000)
        const bucket = buckets.get(minute) ?? { up: 0, conclusive: 0, latency: 0, measured: 0 }
        if (check.status === 'success') {
          bucket.up += 1
          bucket.conclusive += 1
        } else if (check.status === 'failure') {
          bucket.conclusive += 1
        }
        if (check.status !== 'inconclusive' && check.latency_ms != null) {
          bucket.latency += check.latency_ms
          bucket.measured += 1
        }
        buckets.set(minute, bucket)
      }
    }
    const minutes = [...buckets.keys()].sort((a, b) => a - b)
    const health: number[] = []
    const latency: number[] = []
    for (const minute of minutes) {
      const bucket = buckets.get(minute)!
      if (bucket.conclusive > 0) health.push((bucket.up / bucket.conclusive) * 100)
      if (bucket.measured > 0) latency.push(Math.round(bucket.latency / bucket.measured))
    }
    return { health, latency }
  }, [activeProjects, statuses])

  /** Mean share of expected checks that produced a verdict, across endpoints. */
  const coverage = useMemo(() => {
    const values = activeProjects
      .map((project) => statuses[project.project_id]?.summary?.coverage_pct)
      .filter((value): value is number => typeof value === 'number')
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  }, [activeProjects, statuses])

  const failing = useMemo(
    () =>
      activeProjects
        .map((project) => ({
          project,
          streak: failureStreak(statuses[project.project_id]?.checks ?? []),
        }))
        .filter((entry) => entry.project.current_status === 'failure'),
    [activeProjects, statuses],
  )

  const kpis: MagicBentoItem[] = useMemo(() => {
    const healthSeries = timeline.health.length >= 2 ? timeline.health.slice(-40) : []
    const latencySeries = timeline.latency.length >= 2 ? timeline.latency.slice(-30) : []

    return [
      {
        id: 'health',
        title: 'System Health',
        description: 'Minute-by-minute pass rate across every endpoint.',
        visual: (
          <>
            <BentoFigure
              value={
                healthPct === null ? (
                  '—'
                ) : (
                  <Counter
                    value={healthPct}
                    decimals={1}
                    suffix="%"
                    direction="up"
                    duration={0.9}
                    bounce={0.28}
                    stagger={0.03}
                    fade={0.24}
                    fontSize={24}
                    fontWeight={600}
                    tabular
                    motionBlur
                  />
                )
              }
              note={checked.length > 0 ? `${healthy} of ${checked.length} responding` : 'no checks yet'}
            />
            <BentoArea
              values={healthSeries}
              color={healthPct === null || healthPct >= 99 ? STATUS.ok : STATUS.warn}
              floorAtZero
            />
          </>
        ),
      },
      {
        id: 'latency',
        title: 'Avg Latency',
        description: 'Mean response time, bucketed by minute.',
        visual: (
          <>
            <BentoFigure
              value={
                avgLatency === null ? (
                  '—'
                ) : (
                  <Counter
                    value={avgLatency}
                    suffix="ms"
                    direction="up"
                    duration={0.9}
                    bounce={0.28}
                    stagger={0.03}
                    fade={0.24}
                    fontSize={24}
                    fontWeight={600}
                    tabular
                    motionBlur
                  />
                )
              }
              note={latencySeries.length >= 2 ? 'last 30 min' : 'waiting for data'}
            />
            <BentoBars values={latencySeries.length >= 2 ? latencySeries : [0]} color={STATUS.accent} />
          </>
        ),
      },
      {
        id: 'incidents',
        title: 'Active Incidents',
        description: 'Endpoints that have tripped their failure threshold.',
        visual: (
          <>
            <BentoFigure
              value={
                <Counter
                  value={incidents}
                  direction="up"
                  duration={0.8}
                  bounce={0.3}
                  stagger={0.03}
                  fade={0.24}
                  fontSize={24}
                  fontWeight={600}
                  tabular
                  motionBlur
                />
              }
              note={incidents > 0 ? 'failing now' : 'all clear'}
            />
            <BentoSteps
              steps={
                failing.length > 0
                  ? failing.slice(0, 3).map((entry) => ({
                      label: entry.project.name,
                      meta: `${entry.streak} failed`,
                    }))
                  : [{ label: 'No endpoint is failing', done: true }]
              }
            />
          </>
        ),
      },
      {
        id: 'endpoints',
        title: 'Endpoints',
        description: 'Probed once a minute, around the clock.',
        visual: (
          <>
            <BentoFigure value={<Counter value={total} fontSize={24} fontWeight={600} tabular motionBlur />} note="monitored" />
            <BentoTiles
              items={activeProjects.map((project) => ({
                key: project.project_id,
                label: project.name,
                tone:
                  project.current_status === 'success'
                    ? ('ok' as const)
                    : project.current_status === 'failure'
                      ? ('crit' as const)
                      : ('neutral' as const),
              }))}
            />
          </>
        ),
      },
    ]
  }, [healthPct, avgLatency, incidents, total, healthy, checked.length, timeline, failing, activeProjects])

  const cards: MagicBentoItem[] = useMemo(
    () =>
      activeProjects.map((project) => ({
        id: project.project_id,
        onClick: () => navigate(`/projects/${project.project_id}`),
        content: <ProjectCard project={project} checks={statuses[project.project_id]?.checks || []} />,
      })),
    [activeProjects, statuses, navigate],
  )

  const ticker = (
    <>
      <TickerStat
        label="Health"
        value={healthPct !== null ? `${healthPct.toFixed(1)}%` : '—'}
        color={healthPct === null ? undefined : healthPct >= 99 ? STATUS.ok : STATUS.warn}
      />
      <TickerStat label="Avg Lat" value={avgLatency !== null ? `${avgLatency}ms` : '—'} />
      <TickerStat label="Incidents" value={String(incidents)} color={incidents > 0 ? STATUS.crit : STATUS.ok} />
      <TickerStat
        label="Coverage"
        value={coverage !== null ? `${coverage.toFixed(0)}%` : '—'}
        color={coverage !== null && coverage < 95 ? STATUS.warn : undefined}
        className="hidden sm:flex"
      />
      <TickerStat label="Endpoints" value={String(total)} className="hidden md:flex" />
    </>
  )

  return (
    <Shell ticker={ticker}>
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-txt-hi">Overview</h1>
          <p className="mt-1 text-[13px] text-txt-lo">Uptime, latency and SLA posture across every endpoint.</p>
        </div>
        <div className="flex items-center gap-2">
          <ActionButton
            variant="secondary"
            icon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />}
            onAction={loadProjects}
            labels={{ loading: 'Refreshing…', success: 'Updated', error: 'Failed' }}
          >
            Refresh
          </ActionButton>
          <ActionButton icon={<Plus className="h-3.5 w-3.5" strokeWidth={2.5} />} onAction={() => setShowAddModal(true)}>
            Add endpoint
          </ActionButton>
        </div>
      </div>

      {/* KPI bento */}
      <MagicBento
        items={kpis}
        columns={4}
        rowHeight={200}
        gap={10}
        radius={18}
        minCell={200}
        spotlightRadius={280}
        className="mt-6"
      />

      {/* Section header */}
      <div className="mt-8 mb-3 flex items-center gap-2.5">
        <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-txt-hi">Monitored endpoints</h2>
        <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[11px] font-medium text-txt-mid">{total}</span>
      </div>

      {/* Content */}
      <div>
        {error && (
          <Alert
            tone="error"
            className="mb-4"
            action={
              <button onClick={loadProjects} className="btn-ghost">
                Retry
              </button>
            }
          >
            {error}
            {loaded && ' — showing the last loaded data.'}
          </Alert>
        )}

        {loading && !loaded && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="mb__card h-[248px] p-[18px]">
                <div className="skeleton h-6 w-24" />
                <div className="skeleton mt-4 h-14 w-full" />
                <div className="skeleton mt-6 h-4 w-40" />
                <div className="skeleton mt-2 h-3 w-28" />
              </div>
            ))}
          </div>
        )}

        {loaded && activeProjects.length === 0 && (
          <div className="mb__card flex flex-col items-center justify-center gap-4 py-20 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-xl bg-white/[0.04] text-txt-lo">
              <Radar className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <div>
              <p className="font-display text-[15px] font-semibold text-txt-hi">No endpoints yet</p>
              <p className="mt-1 text-[13px] text-txt-lo">Add a website to start checking it every minute.</p>
            </div>
            <ActionButton icon={<Plus className="h-3.5 w-3.5" strokeWidth={2.5} />} onAction={() => setShowAddModal(true)}>
              Add endpoint
            </ActionButton>
          </div>
        )}

        {cards.length > 0 && (
          <MagicBento items={cards} columns={3} rowHeight={252} gap={10} radius={18} minCell={290} />
        )}
      </div>

      {showAddModal && (
        <AddProjectModal
          onClose={() => setShowAddModal(false)}
          onSuccess={(project) => {
            setShowAddModal(false)
            setProjects((prev) => [...prev, project])
            getProjectStatus(project.project_id, 1)
              .then((status) => setStatuses((prev) => ({ ...prev, [project.project_id]: status })))
              .catch(() => {})
          }}
        />
      )}
    </Shell>
  )
}

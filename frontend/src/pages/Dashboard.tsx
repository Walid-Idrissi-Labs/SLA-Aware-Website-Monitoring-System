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
import { POLL_INTERVAL_MS, STATUS, verdictFor, type Verdict } from '../lib/format'
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

const TILE_TONE: Record<Verdict, 'ok' | 'crit' | 'warn' | 'neutral'> = {
  up: 'ok',
  down: 'crit',
  stale: 'warn',
  inconclusive: 'neutral',
  off: 'neutral',
  pending: 'neutral',
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [statuses, setStatuses] = useState<Record<string, ProjectStatus>>({})
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  // Captured on every poll, failed ones too, so a stopped monitor or a dead API
  // ages the data into STALE instead of leaving the last verdict up forever.
  const [now, setNow] = useState(Date.now)
  const requestSeq = useRef(0)
  const navigate = useNavigate()

  const loadProjects = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    try {
      const data = await getProjects(1)
      if (seq !== requestSeq.current) return // a newer request superseded this one
      const statusMap: Record<string, ProjectStatus> = {}
      data.forEach((p) => {
        if (p.status) statusMap[p.project_id] = p.status
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
      if (seq === requestSeq.current) {
        setLoading(false)
        setNow(Date.now())
      }
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    // A hidden tab gets refetched by the visibility listener below, so polling
    // it in the background is a fetch plus a full re-render for nobody.
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadProjects()
    }, POLL_INTERVAL_MS)
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
  const verdicts = useMemo(
    () => Object.fromEntries(activeProjects.map((p) => [p.project_id, verdictFor(p, now)])),
    [activeProjects, now],
  )
  const tally = (...wanted: Verdict[]) => activeProjects.filter((p) => wanted.includes(verdicts[p.project_id])).length
  const total = activeProjects.length
  const healthy = tally('up')
  // Every endpoint past its first check owes an answer: stale or unanswered
  // ones count against health without being called failures.
  const due = total - tally('pending')
  const unverified = tally('stale', 'inconclusive')
  // Only an endpoint that is up right now has a current, real latency: a stale one
  // is old, and a down or unanswered one may carry the synthetic timeout value.
  const withLatency = activeProjects.filter((p) => p.last_latency_ms != null && verdicts[p.project_id] === 'up')
  const avgLatency =
    withLatency.length > 0
      ? Math.round(withLatency.reduce((sum, p) => sum + (p.last_latency_ms || 0), 0) / withLatency.length)
      : null
  const incidents = tally('down')
  const healthPct = due > 0 ? (healthy / due) * 100 : null

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
        .filter((entry) => verdicts[entry.project.project_id] === 'down'),
    [activeProjects, statuses, verdicts],
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
              note={due > 0 ? `${healthy} of ${due} up` : 'no checks yet'}
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
              note={
                incidents > 0 ? (
                  'failing now'
                ) : unverified > 0 ? (
                  <span style={{ color: STATUS.warn }}>{unverified} unverified</span>
                ) : (
                  'all clear'
                )
              }
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
                tone: TILE_TONE[verdicts[project.project_id]],
              }))}
            />
          </>
        ),
      },
    ]
  }, [healthPct, avgLatency, incidents, unverified, total, healthy, due, timeline, failing, activeProjects, verdicts])

  const cards: MagicBentoItem[] = useMemo(
    () =>
      activeProjects.map((project) => ({
        id: project.project_id,
        onClick: () => navigate(`/projects/${project.project_id}`),
        content: (
          <ProjectCard
            project={project}
            checks={statuses[project.project_id]?.checks || []}
            verdict={verdicts[project.project_id]}
          />
        ),
      })),
    [activeProjects, statuses, verdicts, navigate],
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

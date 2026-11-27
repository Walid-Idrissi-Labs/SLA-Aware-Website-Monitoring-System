import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Plus, Radar, RefreshCw } from 'lucide-react'
import Shell from '../components/Shell'
import TickerStat from '../components/TickerStat'
import ActionButton from '../components/ActionButton'
import BarStrip from '../components/BarStrip'
import HoverCard, { HoverRow } from '../components/HoverCard'
import { Alert } from '../components/ui'
import { getProjects } from '../lib/api'
import { ERROR_TYPE, POLL_INTERVAL_MS, STATUS, fmtUtcTime, nextPass, timeAgo, verdictFor, type Verdict } from '../lib/format'
import { deriveEvents, fmtMs, passQueue, recent, runOffset, runSlots, stagesOf, type EventKind, type PipelineEvent, type RunSlot } from '../lib/pipeline'
import type { Check, Project } from '../types'

const VERDICT_TONE: Record<Check['status'], { label: string; color: string }> = {
  success: { label: 'UP', color: STATUS.ok },
  failure: { label: 'DOWN', color: STATUS.crit },
  inconclusive: { label: 'NO VERDICT', color: STATUS.neutral },
}

/** The hold reads as waiting: hatched, not a colour of its own. */
const HELD_FILL = 'repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0 2px, rgba(255,255,255,0.04) 2px 5px)'
const STARTUP_FILL = 'rgba(255,255,255,0.2)'

const EVENT_TONE: Record<EventKind, { label: string; color: string }> = {
  first: { label: 'First', color: STATUS.ok },
  failing: { label: 'Failing', color: STATUS.warn },
  down: { label: 'Down', color: STATUS.crit },
  still: { label: 'Down', color: STATUS.crit },
  up: { label: 'Up', color: STATUS.ok },
  recovered: { label: 'Up', color: STATUS.ok },
  noevidence: { label: 'No verdict', color: STATUS.neutral },
  gap: { label: 'No check', color: STATUS.warn },
}

/** "HH:MM:SS" of an epoch ms, UTC. */
const hms = (ms: number) => new Date(ms).toISOString().slice(11, 19)
const hm = (ms: number) => new Date(ms).toISOString().slice(11, 16)

function Panel({ title, caption, children, className = '' }: { title: string; caption?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel-flush ${className}`}>
      {/* On a phone the caption wraps under the title rather than being cut: it says what the panel is. */}
      <div className="panel-head h-auto min-h-11 flex-wrap gap-y-0.5 py-2.5 sm:h-11 sm:flex-nowrap sm:py-0">
        <h2 className="shrink-0 text-[13px] font-semibold text-txt-hi">{title}</h2>
        {caption && <span className="text-[11.5px] text-txt-lo sm:min-w-0 sm:truncate">{caption}</span>}
      </div>
      {children}
    </section>
  )
}

// ─── Stages ─────────────────────────────────────────────────────────────────

function StageCard({ index, name, service, what, live, note }: { index: string; name: string; service: string; what: string; live: ReactNode; note?: string }) {
  return (
    <div className="panel flex min-w-0 flex-col p-4">
      <p className="font-mono text-[11px] text-txt-lo">
        <span className="text-accent">{index}</span> · {service}
      </p>
      <h3 className="mt-1.5 font-display text-[15px] font-semibold tracking-[-0.01em] text-txt-hi">{name}</h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-txt-mid">{what}</p>
      <div className="mt-auto pt-3">
        <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-mono text-[11.5px] leading-relaxed text-txt-hi">{live}</div>
        {note && <p className="mt-2 text-[11px] leading-relaxed text-txt-lo">{note}</p>}
      </div>
    </div>
  )
}

/** The chevron between two stage cards: across from md, down below it. */
function Joint() {
  return (
    <div aria-hidden="true" className="grid place-items-center text-txt-dim">
      <ArrowRight className="h-4 w-4 rotate-90 md:rotate-0" strokeWidth={1.75} />
    </div>
  )
}

// ─── Last run ───────────────────────────────────────────────────────────────

interface Latest {
  project: Project
  verdict: Verdict
  check: Check | null
}

function StageBar({ check, scale }: { check: Check; scale: number }) {
  const stages = stagesOf(check)
  if (!stages) return <p className="font-mono text-[12px] text-txt-lo">—</p>
  const tone = VERDICT_TONE[check.status]
  const pct = (ms: number) => `max(2px, ${(ms / scale) * 100}%)`
  return (
    <div>
      <div
        role="img"
        aria-label={`Start-up ${fmtMs(stages.startup)}, probe ${fmtMs(stages.probe)}, held ${fmtMs(stages.hold)}`}
        className="flex h-2.5 w-full overflow-hidden rounded-[2px] bg-white/[0.04]"
      >
        <span className="h-full transition-[width] duration-500" style={{ width: pct(stages.startup), background: STARTUP_FILL }} />
        <span className="h-full transition-[width] duration-500" style={{ width: pct(stages.probe), background: tone.color }} />
        <span className="h-full transition-[width] duration-500" style={{ width: pct(stages.hold), background: HELD_FILL }} />
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-3 font-mono text-[10.5px] text-txt-lo">
        <span className="whitespace-nowrap">start-up {fmtMs(stages.startup)}</span>
        <span className="whitespace-nowrap">
          probe <span className="text-txt-mid">{fmtMs(stages.probe)}</span>
        </span>
        <span className="whitespace-nowrap">held {fmtMs(stages.hold)}</span>
      </p>
    </div>
  )
}

function LastRun({ rows }: { rows: Latest[] }) {
  const scale = Math.max(1, ...rows.map((r) => (r.check ? (stagesOf(r.check)?.total ?? 0) : 0)))
  return (
    <ul className="divide-y divide-white/[0.05]">
      {rows.map(({ project, verdict, check }) => {
        const stages = check ? stagesOf(check) : null
        const tone = check ? VERDICT_TONE[check.status] : null
        const dim = verdict === 'stale' || !check
        return (
          <li
            key={project.project_id}
            className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(140px,0.9fr)_minmax(0,2.4fr)_auto] ${dim ? 'opacity-60' : ''}`}
          >
            <div className="min-w-0">
              <Link to={`/projects/${project.project_id}`} className="block truncate text-[13px] font-medium text-txt-hi hover:underline">
                {project.name}
              </Link>
              {tone && (
                <span className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[10.5px]" style={{ color: tone.color }}>
                  <span className="h-1.5 w-1.5 rounded-[1px]" style={{ backgroundColor: tone.color }} />
                  {tone.label}
                </span>
              )}
            </div>
            <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:pt-1">
              {check ? (
                <StageBar check={check} scale={scale} />
              ) : (
                <p className="text-[11.5px] text-txt-lo">{verdict === 'pending' ? 'First check due within a minute.' : 'No check in the last hour.'}</p>
              )}
            </div>
            <div className="text-right">
              <p className="font-mono text-[12.5px] tabular-nums text-txt-hi">{stages ? fmtMs(stages.total) : '—'}</p>
              <p className="mt-0.5 font-mono text-[10.5px] tabular-nums text-txt-lo">
                {!check
                  ? ''
                  : verdict === 'stale'
                    ? `${timeAgo(check.timestamp)} ago`
                    : check.run_started_at != null
                      ? `run ${hms(check.run_started_at)}`
                      : `checked ${hms(check.timestamp)}`}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ─── Runs, last hour ────────────────────────────────────────────────────────

/** A run's bar, filled bottom up by its checks' verdicts: down first, so one failure never hides. */
function runFill(slot: RunSlot): string {
  const total = slot.up + slot.down + slot.none
  const down = (slot.down / total) * 100
  const none = down + (slot.none / total) * 100
  return `linear-gradient(to top, ${STATUS.crit} 0 ${down}%, ${STATUS.neutral}99 ${down}% ${none}%, ${STATUS.ok}cc ${none}% 100%)`
}

function RunCard({ slot, anchor, leaving }: { slot: RunSlot; anchor: DOMRect; leaving: boolean }) {
  const when = slot.start ?? slot.minute * 60_000
  const slowest = slot.rows.reduce<{ name: string; ms: number } | null>((best, { project, check }) => {
    const ms = stagesOf(check)?.probe
    return ms != null && (!best || ms > best.ms) ? { name: project.name, ms } : best
  }, null)
  return (
    <HoverCard anchor={anchor} leaving={leaving} width={232}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-txt-hi">{slot.start ? 'Run' : 'Minute'}</span>
        <span className="font-mono tabular-nums text-txt-mid">{slot.start ? fmtUtcTime(when) : `${hm(when)} UTC`}</span>
      </div>
      {slot.rows.length === 0 ? (
        <p className="mt-1 text-txt-mid">{slot.expected ? 'No check of yours was stored this minute.' : 'None of your endpoints existed yet.'}</p>
      ) : (
        <>
          <div className="my-1.5 h-px bg-white/[0.06]" />
          <dl className="space-y-1">
            <HoverRow label="Stored">
              {slot.rows.length} of {Math.max(slot.expected, slot.rows.length)}
            </HoverRow>
            <HoverRow label="Last write at">{slot.duration != null ? `+${fmtMs(slot.duration)}` : <span className="text-txt-lo">not recorded</span>}</HoverRow>
            {slowest && <HoverRow label="Slowest probe">{`${fmtMs(slowest.ms)}`}</HoverRow>}
            {slot.runs > 1 && <HoverRow label="Runs">{slot.runs}, an invocation ran twice</HoverRow>}
          </dl>
          <div className="my-1.5 h-px bg-white/[0.06]" />
          <ul className="space-y-0.5">
            {slot.rows.slice(0, 8).map(({ project, check }, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 flex-none rounded-[1px]" style={{ backgroundColor: VERDICT_TONE[check.status].color }} />
                <span className="min-w-0 flex-1 truncate text-txt-mid">{project.name}</span>
              </li>
            ))}
            {slot.rows.length > 8 && <li className="text-txt-lo">+{slot.rows.length - 8} more</li>}
          </ul>
        </>
      )}
    </HoverCard>
  )
}

function RunStrip({ slots }: { slots: RunSlot[] }) {
  const longest = Math.max(1, ...slots.map((s) => s.duration ?? 0))
  return (
    <BarStrip
      items={slots}
      slots={slots.length}
      keyOf={(s) => s.minute}
      interactive
      size="h-16 gap-px sm:gap-[2px]"
      label="One bar per minute of the last hour, filled by your checks' verdicts in that run; taller bars took longer to store their rows."
      describe={(s) =>
        `${hm(s.minute * 60_000)} UTC: ${
          s.rows.length
            ? `${s.up} up, ${s.down} down, ${s.none} without a verdict${s.duration != null ? `, last write after ${fmtMs(s.duration)}` : ''}`
            : 'no check stored'
        }`
      }
      barClass={(s, active) => {
        const ring = active ? 'outline outline-1 outline-white/60' : ''
        if (!s.rows.length) return `${s.expected ? 'border border-dashed border-white/[0.14]' : 'bg-white/[0.03]'} ${ring}`
        return ring
      }}
      barStyle={(s) => {
        if (!s.rows.length) return undefined
        // 40% for the verdicts to stay legible, the rest in proportion to the time to the last write.
        const share = s.duration != null ? s.duration / longest : 0
        return {
          height: `${40 + Math.round(share * 60)}%`,
          background: runFill(s),
        }
      }}
      card={(i, anchor, leaving) => <RunCard slot={slots[i]} anchor={anchor} leaving={leaving} />}
    />
  )
}

// ─── Events ─────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: PipelineEvent }) {
  const tone = EVENT_TONE[event.kind]
  const check = event.check
  const cause = check?.error_type ? ERROR_TYPE[check.error_type] : null
  return (
    <li className="grid animate-fade-in grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[64px_84px_minmax(120px,0.6fr)_minmax(0,2fr)] sm:items-baseline">
      <span className="font-mono text-[11px] tabular-nums text-txt-lo">{event.undated ? '—' : hms(event.at)}</span>
      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: tone.color }}>
        {tone.label}
      </span>
      <Link to={`/projects/${event.project.project_id}`} className="col-span-2 truncate text-[12.5px] font-medium text-txt-hi hover:underline sm:col-span-1">
        {event.project.name}
      </Link>
      <p className="col-span-2 text-[12.5px] leading-relaxed text-txt-mid sm:col-span-1">
        {event.text}
        {check && check.status !== 'success' && (
          <span className="ml-2 font-mono text-[10.5px]" style={{ color: cause?.color ?? STATUS.neutral }}>
            {check.http_status_code ? `HTTP ${check.http_status_code}` : cause?.label}
          </span>
        )}
      </p>
    </li>
  )
}

/** What the next pass should write, judging by your checks. */
function passLine({ open, close }: { open: number; close: number }): string {
  const incidents = (n: number) => `${n} incident${n === 1 ? '' : 's'}`
  if (open && close) return `By your checks: opens ${incidents(open)}, closes ${close}`
  if (open) return `By your checks: opens ${incidents(open)}`
  if (close) return `By your checks: closes ${incidents(close)}`
  return 'By your checks: nothing to open or close'
}

/** The page lists this many events, newest first. */
const EVENT_LIMIT = 50

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Pipeline() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  const requestSeq = useRef(0)

  // The overview's poll: the last hour of every endpoint in one request, once a minute while visible.
  const load = useCallback(async () => {
    const seq = ++requestSeq.current
    try {
      const data = await getProjects(1)
      if (seq !== requestSeq.current) return
      setProjects(data)
      // The clock only moves with the data: a failed poll must not read as a monitor gone quiet.
      setNow(Date.now())
      setError(null)
      setLoaded(true)
    } catch (e) {
      if (seq !== requestSeq.current) return
      setError(e instanceof Error ? e.message : 'Failed to load the pipeline')
    }
  }, [])

  useEffect(() => {
    load()
    const poll = window.setInterval(() => document.visibilityState === 'visible' && load(), POLL_INTERVAL_MS)
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const active = useMemo(() => projects.filter((p) => p.active), [projects])
  const slots = useMemo(() => runSlots(projects, now), [projects, now])
  const events = useMemo(() => deriveEvents(projects, now), [projects, now])
  const offset = useMemo(() => runOffset(projects, now), [projects, now])
  const queue = useMemo(() => passQueue(projects, now), [projects, now])
  const latestRows: Latest[] = useMemo(
    () =>
      active
        .map((project) => ({
          project,
          verdict: verdictFor(project, now),
          check: recent(project, now).slice(-1)[0] ?? null,
        }))
        // Endpoints with a current check first, in the overview's order.
        .sort((a, b) => Number(!a.check || a.verdict === 'stale') - Number(!b.check || b.verdict === 'stale')),
    [active, now],
  )

  const withRows = slots.filter((s) => s.rows.length > 0)
  const newest = withRows[withRows.length - 1] ?? null
  const runsSeen = withRows.length
  const runsDue = slots.filter((s) => s.expected > 0 || s.rows.length > 0).length
  const checksSeen = active.reduce((sum, p) => sum + recent(p, now).length, 0)
  const failing = latestRows.filter((r) => r.verdict === 'down').length
  const pass = nextPass(now)
  const minutesToPass = Math.max(1, Math.ceil((pass - now) / 60_000))
  const second = offset ? Math.floor(offset.ms / 1000) : null
  // Rows from before the stage times existed only say when their probe ended.
  const lastLabel = newest?.start != null ? 'Last run' : 'Last check'
  const lastAt = newest ? (newest.start ?? newest.rows[0].check.timestamp) : null

  const ticker = (
    <>
      <TickerStat label="Runs" value={loaded && runsDue ? `${runsSeen}/${runsDue}` : '—'} color={runsSeen < runsDue ? STATUS.warn : undefined} />
      <TickerStat label={lastLabel} value={lastAt != null ? hms(lastAt) : '—'} className="hidden sm:flex" />
      <TickerStat label="Failing" value={String(failing)} color={failing ? STATUS.crit : STATUS.ok} className="hidden md:flex" />
      <TickerStat label="Next pass" value={hm(pass)} className="hidden lg:flex" />
    </>
  )

  return (
    <Shell ticker={ticker}>
      <div className="flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div className="max-w-3xl">
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-txt-hi">Pipeline</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-txt-lo">
            What the monitor did with your endpoints in the last hour, stage by stage. Stage times are read from each check row; anything worked out from them
            says so.{' '}
            <Link to="/about/check" className="whitespace-nowrap font-medium text-accent hover:underline">
              How a check works
            </Link>
          </p>
        </div>
        <ActionButton
          variant="secondary"
          icon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />}
          onAction={load}
          labels={{
            loading: 'Refreshing…',
            success: 'Updated',
            error: 'Failed',
          }}
        >
          Refresh
        </ActionButton>
      </div>

      {error && (
        <Alert
          tone="error"
          className="mt-5"
          action={
            <button onClick={load} className="btn-ghost">
              Retry
            </button>
          }
        >
          {error}
          {loaded && ' — showing the last loaded data.'}
        </Alert>
      )}

      {/* The three stages, in the order a check meets them */}
      <div className="mt-6 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] animate-fade-up" style={{ animationDelay: '60ms' }}>
        <StageCard
          index="01"
          service="EventBridge"
          name="Schedule"
          what="Invokes the monitor once a minute, at the same second each time. There is no queue of ours in between."
          live={
            second != null ? (
              <>
                {offset?.stamped ? 'Runs start' : 'Checks land'} about {second} s into each minute
                <br />
                <span className="text-txt-mid">
                  Checks of yours in {runsSeen} of the last {runsDue} minutes
                </span>
              </>
            ) : (
              <span className="text-txt-mid">No checks in the last hour</span>
            )
          }
          note="How long the timer takes to start a run is not recorded."
        />
        <Joint />
        <StageCard
          index="02"
          service="Monitor Lambda"
          name="Probe, store, alert"
          what="Probes your endpoints in parallel, stores a row with each verdict once every probe is back, then applies the alert rules."
          live={
            newest && lastAt != null ? (
              <>
                {lastLabel} {hms(lastAt)} UTC
                <br />
                <span className="text-txt-mid">
                  {newest.rows.length} check{newest.rows.length === 1 ? '' : 's'}
                  {newest.duration != null ? `, last write at +${fmtMs(newest.duration)}` : ''}
                </span>
              </>
            ) : (
              <span className="text-txt-mid">No run with your checks in the last hour</span>
            )
          }
          note="One run checks every account's endpoints, so the wait and the hold below can include endpoints that aren't yours."
        />
        <Joint />
        <StageCard
          index="03"
          service="SLA Processor"
          name="Record incidents"
          what="Every hour, on the hour, reads two hours of checks and opens or closes the incident records."
          live={
            <>
              Next pass {hm(pass)} UTC, in {minutesToPass} min
              <br />
              <span className="text-txt-mid">{passLine(queue)}</span>
            </>
          }
          note={`Whether the ${hm(pass - 3_600_000)} pass ran can't be read from check rows.`}
        />
      </div>

      {!loaded && !error && (
        <div className="mt-3 space-y-3">
          <div className="skeleton h-40 w-full rounded-lg" />
          <div className="skeleton h-28 w-full rounded-lg" />
        </div>
      )}

      {loaded && active.length === 0 && (
        <div className="mb__card mt-3 flex flex-col items-center justify-center gap-4 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-xl bg-white/[0.04] text-txt-lo">
            <Radar className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <div>
            <p className="font-display text-[15px] font-semibold text-txt-hi">No endpoints yet</p>
            <p className="mt-1 text-[13px] text-txt-lo">Add one and its first run shows up here within a minute.</p>
          </div>
          <ActionButton icon={<Plus className="h-3.5 w-3.5" strokeWidth={2.5} />} onAction={() => navigate('/dashboard', { state: { addEndpoint: true } })}>
            Add endpoint
          </ActionButton>
        </div>
      )}

      {loaded && active.length > 0 && (
        <>
          <Panel title="Last run" caption="each endpoint's newest check" className="mt-3 animate-fade-up">
            <LastRun rows={latestRows} />
            {latestRows.some((r) => r.check && !stagesOf(r.check)) && (
              <p className="border-t border-white/[0.05] px-4 py-2.5 text-[11px] text-txt-lo">
                Rows marked — were stored before the monitor recorded stage times.
              </p>
            )}
            {latestRows.some((r) => r.check && stagesOf(r.check)) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.05] px-4 py-2.5 text-[11px] text-txt-lo">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-3 rounded-[1px]" style={{ background: STARTUP_FILL }} />
                  Start-up: list endpoints, wait for a worker
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-3 rounded-[1px] bg-ok" />
                  Probe, coloured by verdict
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-3 rounded-[1px]" style={{ background: HELD_FILL }} />
                  Held until every probe is back
                </span>
              </div>
            )}
          </Panel>

          <Panel title="Runs, last hour" caption="one bar per minute · taller bars took longer to store" className="mt-3">
            <div className="px-4 pb-3 pt-4">
              <RunStrip slots={slots} />
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-txt-lo">
                {(
                  [
                    ['Up', `${STATUS.ok}cc`],
                    ['Down', STATUS.crit],
                    ['No verdict', `${STATUS.neutral}99`],
                  ] as const
                ).map(([label, color]) => (
                  <span key={label} className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[1px]" style={{ backgroundColor: color }} />
                    {label}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[1px] border border-dashed border-white/30" />
                  No check stored
                </span>
                {newest && (
                  <span className="ml-auto font-mono text-[10.5px]">
                    {hm(slots[0].minute * 60_000)}–{hm(newest.minute * 60_000)} UTC
                  </span>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Events" caption="worked out from check rows by the alert rules · not a log" className="mt-3">
            {events.length > 0 ? (
              <ol className="divide-y divide-white/[0.05]">
                {events.slice(0, EVENT_LIMIT).map((event) => (
                  <EventRow key={`${event.project.project_id}:${event.kind}:${event.at}`} event={event} />
                ))}
              </ol>
            ) : (
              <p className="px-4 py-6 text-center text-[12.5px] text-txt-lo">Nothing to report: {checksSeen} checks in the last hour, all up.</p>
            )}
            {events.length > EVENT_LIMIT && (
              <p className="border-t border-white/[0.05] px-4 py-2.5 text-[11px] text-txt-lo">
                Showing the newest {EVENT_LIMIT} of {events.length}.
              </p>
            )}
            <p className="border-t border-white/[0.05] px-4 py-2.5 text-[11px] leading-relaxed text-txt-lo">
              “Alert rule met” is the monitor's decision to send an email. Whether one was delivered is not recorded here.
            </p>
          </Panel>
        </>
      )}
    </Shell>
  )
}

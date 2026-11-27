import { useMemo, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { Check, Incident } from '../types'
import IncidentState from '../components/IncidentState'
import StatusStrip from '../components/StatusStrip'
import { formatDowntime, type Verdict } from '../lib/format'
import { hourlyPass } from './sandbox'

type Status = Check['status']

const MIN = 60_000
/** The panel reads the last hour of checks, so the sequence stays inside it. */
const KEEP = 45
const passes = (k: number): Status[] => Array(k).fill('success')
const fails = (k: number): Status[] => Array(k).fill('failure')

const PRESETS: { label: string; seq: Status[] }[] = [
  { label: 'A blip', seq: [...passes(10), ...fails(2), ...passes(2)] },
  { label: 'An outage and its recovery', seq: [...passes(8), ...fails(6), ...passes(2)] },
  { label: 'A challenge page mid-outage', seq: [...passes(8), ...fails(2), 'inconclusive', ...fails(2)] },
]

const VERDICT_OF: Record<Status, Verdict> = { success: 'up', failure: 'down', inconclusive: 'inconclusive' }

/** What the sandbox's checks would have looked like: a fast 200, a timeout, a bot-challenge 403. */
function sample(status: Status, timestamp: number, i: number): Check {
  if (status === 'success') return { timestamp, status, latency_ms: 140 + ((i * 37) % 90), http_status_code: 200, accepted_status: '200-399' }
  if (status === 'failure') return { timestamp, status, latency_ms: 10_000, http_status_code: 0, error_type: 'timeout', accepted_status: '200-399' }
  return { timestamp, status, latency_ms: 95, http_status_code: 403, error_type: 'blocked', accepted_status: '200-399' }
}

const hhmm = (sec: number) => `${new Date(sec * 1000).toISOString().slice(11, 16)} UTC`

const DOT = { success: 'bg-ok', failure: 'bg-crit', inconclusive: 'bg-white/35' }

/**
 * Add checks one minute apart and watch the endpoint page's own incident panel
 * react. The record only moves when the hourly pass runs, by the processor's rules.
 */
export default function StreakSandbox() {
  const [t0] = useState(() => Math.floor(Date.now() / MIN) * MIN - 30 * MIN)
  const [timeline, setTimeline] = useState({ from: t0, seq: passes(12) })
  const [threshold, setThreshold] = useState(3)
  const [record, setRecord] = useState<Incident[]>([])
  const [note, setNote] = useState('Add checks, then run the hourly pass to see the record catch up.')

  const checks = useMemo(() => timeline.seq.map((s, i) => sample(s, timeline.from + i * MIN, i)), [timeline])
  const latest = checks[checks.length - 1]
  const now = latest.timestamp + 20_000

  const add = (status: Status) =>
    setTimeline(({ from, seq }) => {
      const next = [...seq, status]
      const drop = Math.max(0, next.length - KEEP)
      return { from: from + drop * MIN, seq: next.slice(drop) }
    })

  const runPass = () => {
    const next = hourlyPass(checks, record, threshold, now)
    const opened = next.filter((i) => !record.some((r) => r.start_time === i.start_time))
    const closed = next.filter((i) => i.resolved && record.some((r) => r.start_time === i.start_time && !r.resolved))
    const done = [...opened, ...closed]
    setRecord(next)
    if (!done.length) setNote('The pass found nothing new to record.')
    else
      setNote(
        done
          .map((i) =>
            i.resolved
              ? `${opened.includes(i) ? 'Recorded and closed' : 'Closed'} an incident: ${formatDowntime(i.duration_seconds ?? 0)} down, ${hhmm(i.start_time)} to ${hhmm(i.end_time!)}.`
              : `Opened an incident from ${hhmm(i.start_time)}; it stays open until a check passes.`,
          )
          .join(' '),
      )
  }

  const load = (seq: Status[], label?: string) => {
    setTimeline({ from: t0, seq })
    setRecord([])
    setNote(label ? `${label}: now run the hourly pass, or add more checks.` : 'Add checks, then run the hourly pass to see the record catch up.')
  }

  return (
    <div className="panel-flush">
      <div className="panel-head">
        <span className="text-[13px] font-semibold text-txt-hi">Try the incident rule</span>
        <button
          type="button"
          onClick={() => {
            load(passes(12))
            setThreshold(3)
          }}
          className="flex items-center gap-1.5 text-[12px] text-txt-lo hover:text-txt-hi"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['success', 'Add pass'],
              ['failure', 'Add fail'],
              ['inconclusive', 'Add no-evidence'],
            ] as const
          ).map(([status, label]) => (
            <button key={status} type="button" onClick={() => add(status)} className="btn-ghost h-9">
              <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
              {label}
            </button>
          ))}
          <div className="ml-1 flex h-9 items-center gap-1 rounded-[10px] border border-white/[0.09] px-1.5" role="group" aria-label="Failures in a row to open an incident">
            <span className="px-1.5 text-[12px] text-txt-lo">Failures to open</span>
            <button type="button" aria-label="Fewer" onClick={() => setThreshold((n) => Math.max(1, n - 1))} className="grid h-6 w-6 place-items-center rounded text-txt-mid hover:bg-white/[0.06] hover:text-txt-hi">
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-5 text-center font-mono text-[13px] text-txt-hi" aria-live="polite">
              {threshold}
            </span>
            <button type="button" aria-label="More" onClick={() => setThreshold((n) => Math.min(5, n + 1))} className="grid h-6 w-6 place-items-center rounded text-txt-mid hover:bg-white/[0.06] hover:text-txt-hi">
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <button type="button" onClick={runPass} className="btn-ghost ml-auto h-9 border-accent/30 text-accent hover:border-accent/50 hover:text-accent">
            Run the hourly pass
          </button>
        </div>

        <div>
          <StatusStrip checks={checks} bars={KEEP} />
          <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-txt-lo">
            <span>one check a minute</span>
            <span>now</span>
          </div>
        </div>

        <p className="text-[12.5px] leading-relaxed text-txt-mid" aria-live="polite">
          {note}
        </p>

        <IncidentState checks={checks} threshold={threshold} incidents={record} active verdict={VERDICT_OF[latest.status]} now={now} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
          <span className="text-txt-lo">Try:</span>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => load(p.seq, p.label)} className="text-txt-mid underline-offset-2 hover:text-txt-hi hover:underline">
              {p.label}
            </button>
          ))}
        </div>
        <p className="border-t border-white/[0.06] pt-3 text-[11.5px] leading-relaxed text-txt-lo">
          Illustrative checks, not one of your endpoints. The panel is the one every endpoint page shows. The real pass runs at the top
          of each hour; here it runs when you press the button, by the same rules.
        </p>
      </div>
    </div>
  )
}

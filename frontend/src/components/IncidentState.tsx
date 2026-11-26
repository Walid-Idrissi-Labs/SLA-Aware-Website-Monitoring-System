import { useMemo } from 'react'
import { Radio } from 'lucide-react'
import type { Check, Incident } from '../types'
import { STATUS, formatDowntime, incidentState, nextPass, type IncidentStage, type Verdict } from '../lib/format'
import HowCalculated from './HowCalculated'

const STAGES: { key: IncidentStage; label: string; color: string }[] = [
  { key: 'healthy', label: 'Healthy', color: STATUS.ok },
  { key: 'suspect', label: 'Suspect', color: STATUS.warn },
  { key: 'open', label: 'Incident open', color: STATUS.crit },
  { key: 'recovering', label: 'Recovering', color: STATUS.ok },
]

const BLANK = { off: 'Not monitored', pending: 'Waiting', no_evidence: 'No evidence', no_checks: 'No recent checks' } as const

const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16)
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
/** "14:02 UTC" today, "25 Nov 14:02 UTC" on another day. */
function when(ms: number, now: number) {
  const date = new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${utcDay(ms) === utcDay(now) ? '' : `${date} `}${hhmm(ms)} UTC`
}

interface Props {
  /** The page window's checks, oldest first; only the last hour is read. */
  checks: Check[]
  threshold: number
  incidents: Incident[]
  active: boolean
  verdict: Verdict
  now: number
  className?: string
}

/**
 * Where the endpoint is in the incident lifecycle, Healthy → Suspect → Incident
 * open → Recovering, by the backend's own rules, with what the incident record
 * says underneath. The hourly pass writes that record, so the two can disagree
 * for up to an hour: the record line says when they will agree, and says so
 * when that time has passed.
 */
export default function IncidentState({ checks, threshold, incidents, active, verdict, now, className = '' }: Props) {
  const state = useMemo(
    () => incidentState({ checks, threshold, incidents, active, verdict, now }),
    [checks, threshold, incidents, active, verdict, now],
  )
  const n = Math.max(1, threshold)
  const lit = STAGES.find((stage) => stage.key === state.stage)
  const name = lit?.label ?? BLANK[state.blank ?? 'no_checks']
  // A stale monitor cannot move the state: keep it, dimmed, as of the last check.
  const latest = checks[checks.length - 1]
  const frozen = verdict === 'stale' && lit != null && latest != null
  const at = (ms: number | null) => (ms == null ? '' : when(ms, now))

  const sentence = {
    healthy: 'The latest check passed, with no failures in a row.',
    suspect: `${state.streak} of ${n} failed checks in a row since ${at(state.since)}. ${n - state.streak} more and an incident opens.`,
    open: `Down${state.since ? ` since ${at(state.since)}` : ''}. The incident stays open until a check passes.`,
    recovering: `Back up at ${at(state.since)} after ${formatDowntime(state.downFor ?? 0)} down.`,
    no_evidence: `The latest check gave no evidence${state.reset ? `, so the failure count reset (was ${state.reset} of ${n})` : ''}.`,
    no_checks: 'No checks in the last hour, so there is no state to show.',
    off: 'Not monitored, so nothing opens or closes.',
    pending: 'Waiting for the first check.',
  }[state.stage ?? state.blank ?? 'no_checks']

  const record = state.record
  const overdue = 'overdue' in record && record.overdue
  const recordLine =
    record.kind === 'none'
      ? 'No open incident on record.'
      : record.kind === 'open'
        ? `On record since ${at(record.since)}.`
        : record.kind === 'closing'
          ? overdue
            ? `Still open on record: the hourly pass due at ${hhmm(record.pass)} UTC hasn't closed it.`
            : `Still open on record until the hourly pass at ${hhmm(record.pass)} UTC closes it.`
          : record.kind === 'missing'
            ? overdue
              ? `Not on record: the hourly pass due at ${hhmm(record.pass)} UTC didn't record it.`
              : `Not on record yet: the hourly pass at ${hhmm(record.pass)} UTC records it.`
            : `Still open on record: the next hourly pass, at ${hhmm(record.pass)} UTC, closes it as monitoring stopped.`

  const filled = state.stage === 'open' ? n : state.stage === 'suspect' ? state.streak : 0
  const alarm = state.stage === 'open' && !frozen

  return (
    <div className={`panel-flush ${alarm ? 'border-crit/25' : ''} ${className}`.trim()}>
      <div className="panel-head">
        <div className="flex items-center gap-2.5">
          {alarm && <Radio className="h-4 w-4 animate-pulse text-crit" strokeWidth={2} aria-hidden="true" />}
          <HowCalculated
            label={<span className="whitespace-nowrap text-[13px] font-semibold text-txt-hi">Incident state</span>}
            topic="the incident state"
            rows={[
              { label: 'Failed in a row', value: `${state.streak}` },
              { label: 'Opens an incident at', value: `${n}` },
              { label: 'Open on record', value: 'since' in record ? `since ${at(record.since)}` : 'no' },
              { label: 'Next hourly pass', value: `${hhmm(nextPass(now))} UTC` },
            ]}
            result={`${Math.min(state.streak, n)} of ${n} in a row · ${name}`}
            caveat="A passing or inconclusive check resets the count, and the first passing check ends an outage. Only the hourly pass writes the record, so it can trail the checks by up to an hour."
          />
        </div>
        {/* The "?" says the same, so phones keep the title on one line instead. */}
        <span className="hidden text-[11.5px] text-txt-lo sm:inline">Last hour of checks · hourly record</span>
      </div>
      <div className="px-4 pb-4 pt-3.5">
        <ol aria-label="Incident lifecycle" className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-0">
          {STAGES.map((stage, i) => {
            const on = stage === lit
            return (
              <li key={stage.key} aria-current={on ? 'step' : undefined} className={`flex items-center ${i ? 'sm:flex-1' : ''}`}>
                {i > 0 && <span aria-hidden="true" className="mx-2 hidden h-px min-w-3 flex-1 bg-white/10 sm:block" />}
                <span
                  className={`inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[5px] text-[12px] font-medium sm:w-auto ${
                    on ? (frozen ? 'opacity-60' : '') : 'border-white/[0.08] text-txt-lo'
                  }`}
                  style={
                    on
                      ? {
                          color: stage.color,
                          borderColor: `${stage.color}59`,
                          backgroundColor: `${stage.color}14`,
                          boxShadow: frozen ? undefined : `0 0 14px -4px ${stage.color}`,
                        }
                      : undefined
                  }
                >
                  <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ backgroundColor: on ? stage.color : 'rgba(255,255,255,0.2)' }} />
                  {stage.label}
                </span>
              </li>
            )
          })}
        </ol>
        <div className="mt-3.5 flex items-start gap-3">
          <span aria-hidden="true" className="mt-[5px] flex flex-none gap-1">
            {Array.from({ length: n }, (_, i) => (
              <span
                key={i}
                className="h-2 w-2 rounded-[2px]"
                style={
                  i < filled
                    ? { backgroundColor: state.stage === 'open' ? STATUS.crit : STATUS.warn }
                    : { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)' }
                }
              />
            ))}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] leading-snug text-txt-hi">
              {sentence}
              {frozen && ` As of the last check, ${at(latest.timestamp)}.`}
            </p>
            <p className={`mt-1 text-[11.5px] leading-snug ${overdue ? 'text-warn' : 'text-txt-lo'}`}>{recordLine}</p>
          </div>
        </div>
        {/* Only the state's name, so it is announced when it changes, not on every poll. */}
        <span className="sr-only" aria-live="polite">{`Incident state: ${name}`}</span>
      </div>
    </div>
  )
}

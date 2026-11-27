import { useRef, useState } from 'react'
import { STATUS, SLO_MIN_COVERAGE, availability, sloResult } from '../lib/format'

const RESULT = {
  met: { label: 'SLO met', color: STATUS.ok },
  missed: { label: 'SLO missed', color: STATUS.crit },
  unproven: { label: 'Unproven', color: STATUS.warn },
} as const

const fmt = (v: number) => v.toLocaleString('en-US')
const pct = (v: number) => `${Number(v.toFixed(2))}%`

/** 100 squares: green for up, red for down, hollow for a check with no verdict. */
function Grid({ up, down, label }: { up: number; down: number; label: string }) {
  return (
    <div role="img" aria-label={label} className="grid w-fit grid-cols-10 gap-1">
      {Array.from({ length: 100 }, (_, i) => (
        <span
          key={i}
          className="h-3.5 w-3.5 rounded-[3px]"
          style={
            i < up
              ? { backgroundColor: STATUS.ok }
              : i < up + down
                ? { backgroundColor: STATUS.crit }
                : { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' }
          }
        />
      ))}
    </div>
  )
}

function Chip({ status }: { status: keyof typeof RESULT }) {
  const r = RESULT[status]
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[3px] text-[12px] font-medium" style={{ color: r.color, borderColor: `${r.color}59`, backgroundColor: `${r.color}12` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.color }} />
      {r.label}
    </span>
  )
}

function Readout({ name, value, math }: { name: string; value: string; math: string }) {
  return (
    <div>
      <p className="micro">{name}</p>
      <p className="mt-1 font-display text-[24px] font-semibold leading-none text-txt-hi">{value}</p>
      <p className="mt-1.5 font-mono text-[11.5px] text-txt-mid">{math}</p>
    </div>
  )
}

const TARGET = { min_uptime_pct: 99.9, max_avg_latency_ms: 300 }

function Window({ name, title, up, down }: { name: string; title: string; up: number; down: number }) {
  const { uptime, coverage } = availability(up, down, 100)
  const { slo_status } = sloResult(TARGET, uptime ?? 0, 0, coverage)
  return (
    <div className="panel p-4">
      <p className="font-mono text-[11px] text-txt-lo">
        {name} · 100 expected checks · target 99.9%
      </p>
      <p className="mt-1 font-display text-[14px] font-semibold text-txt-hi">{title}</p>
      <div className="mt-4 flex flex-wrap items-start gap-6">
        <Grid up={up} down={down} label={`${up} up, ${down} down, ${100 - up - down} with no verdict`} />
        <div className="space-y-4">
          <Readout name="Uptime" value={uptime == null ? '—' : pct(uptime)} math={`${up} ÷ (${up} + ${down})`} />
          <Readout name="Coverage" value={pct(coverage)} math={`${up + down} ÷ 100 expected`} />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2.5">
        <Chip status={slo_status} />
        <span className="text-[12px] text-txt-lo">{slo_status === 'unproven' ? `coverage under ${SLO_MIN_COVERAGE}%` : 'enough evidence, target reached'}</span>
      </div>
    </div>
  )
}

type Field = 'expected' | 'up' | 'down' | 'none'
const FIELDS: { key: Field; label: string }[] = [
  { key: 'expected', label: 'Expected checks' },
  { key: 'up', label: 'Up' },
  { key: 'down', label: 'Down' },
  { key: 'none', label: 'No evidence' },
]

function Calculator() {
  // A week of one check a minute where an eleventh of them never ran: 99.14% up, and still unproven.
  const [n, setN] = useState({ expected: 10_080, up: 9_200, down: 80, none: 300 })
  const [target, setTarget] = useState('99.9')
  const [trimmed, setTrimmed] = useState('')

  const set = (key: Field, raw: string) => {
    const v = Math.max(0, Math.floor(Number(raw.replace(/[^\d]/g, '')) || 0))
    const next = { ...n, [key]: v }
    const over = next.up + next.down + next.none - next.expected
    // Editing the expected count passes through small numbers on the way to a big one: never trim the others for it.
    if (over > 0 && key !== 'expected') {
      next[key] = Math.max(0, v - over)
      setTrimmed(`Trimmed ${key === 'none' ? 'no evidence' : key} to fit ${fmt(next.expected)} expected checks.`)
    } else setTrimmed(over > 0 ? 'More results than expected checks: coverage is capped at 100%, as the report caps it.' : '')
    setN(next)
  }

  // A half-typed target ("99.9.") keeps the last one that parsed.
  const lastGoal = useRef(99.9)
  const parsed = Number(target)
  if (target !== '' && Number.isFinite(parsed)) lastGoal.current = Math.min(100, Math.max(0, parsed))
  const goal = lastGoal.current
  const { uptime, coverage } = availability(n.up, n.down, n.expected)
  const { slo_status } = sloResult({ min_uptime_pct: goal, max_avg_latency_ms: Infinity }, uptime ?? 0, 0, coverage)
  const missing = Math.max(0, n.expected - n.up - n.down - n.none)
  const share = (v: number) => (n.expected ? Math.round((v / n.expected) * 100) : 0)

  return (
    <div className="panel-flush">
      <div className="panel-head">
        <span className="text-[13px] font-semibold text-txt-hi">Change the evidence, watch the claim</span>
      </div>
      <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="field-label">{f.label}</span>
                <input className="field" inputMode="numeric" value={fmt(n[f.key])} onChange={(e) => set(f.key, e.target.value)} />
              </label>
            ))}
            <label className="block">
              <span className="field-label">Target uptime %</span>
              <input className="field" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ''))} />
            </label>
          </div>
          <p className="mt-2 min-h-4 text-[11.5px] text-warn" aria-live="polite">
            {trimmed}
          </p>
          <div className="mt-2 grid gap-4 sm:grid-cols-3">
            <Readout name="Uptime" value={uptime == null ? 'No evidence' : pct(uptime)} math={`${fmt(n.up)} ÷ (${fmt(n.up)} + ${fmt(n.down)})`} />
            <Readout name="Coverage" value={pct(coverage)} math={`${fmt(n.up + n.down)} ÷ ${fmt(Math.max(n.expected, n.up + n.down, 1))}`} />
            <div>
              <p className="micro">SLO</p>
              <p className="mt-2">
                <Chip status={slo_status} />
              </p>
              <p className="mt-2 text-[11.5px] leading-relaxed text-txt-mid">
                {slo_status === 'unproven'
                  ? `Under ${SLO_MIN_COVERAGE}% of the expected checks gave a verdict, so neither met nor missed can be claimed.`
                  : slo_status === 'met'
                    ? `${pct(uptime ?? 0)} is at or above the ${pct(goal)} target.`
                    : `${pct(uptime ?? 0)} is below the ${pct(goal)} target.`}
              </p>
            </div>
          </div>
          <p className="mt-4 text-[11.5px] leading-relaxed text-txt-lo">
            {missing ? `${fmt(missing)} expected ${missing === 1 ? 'check' : 'checks'} never ran. ` : 'Every expected check ran. '}
            Missing and no-evidence checks stay out of the uptime but count against coverage. A real report also needs the average latency
            within its target; here it is assumed to be.
          </p>
        </div>
        <div>
          <Grid
            up={share(n.up)}
            down={share(n.down)}
            label={`Scaled to 100: ${share(n.up)} up, ${share(n.down)} down, the rest with no verdict`}
          />
          <p className="mt-2 font-mono text-[10.5px] text-txt-lo">each square ≈ 1% of expected</p>
        </div>
      </div>
    </div>
  )
}

export default function CoverageView() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Window name="A" title="Every check has a verdict" up={100} down={0} />
        <Window name="B" title="Most checks have none" up={10} down={0} />
      </div>
      <div className="panel p-4">
        <p className="text-[13px] font-semibold text-txt-hi">The same percentage, very different evidence</p>
        <div className="mt-3 space-y-1.5 font-mono text-[12px] text-txt-mid">
          <p>
            <span className="text-txt-hi">uptime</span> = up ÷ (up + down)
          </p>
          <p>
            <span className="text-txt-hi">coverage</span> = (up + down) ÷ expected checks
          </p>
          <p>
            <span className="text-txt-hi">SLO</span> = unproven under {SLO_MIN_COVERAGE}% coverage; otherwise met when uptime and average latency
            reach their targets, missed when they don’t
          </p>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-txt-mid">
          Uptime measures what could be concluded. Coverage measures how much of the expected work concluded anything. A report shows
          both, and never calls a target met on thin evidence.
        </p>
      </div>
      <Calculator />
    </div>
  )
}

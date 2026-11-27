import { ChevronRight } from 'lucide-react'
import { STATUS } from '../lib/format'
import StreakSandbox from './StreakSandbox'

const TONE = { up: STATUS.ok, down: STATUS.crit, none: STATUS.neutral }

/** The monitor's classify_response and classify_error, in the order it applies them. */
const RULES: { came: string; verdict: string; tone: keyof typeof TONE; why: string }[] = [
  {
    came: 'An address that isn’t public (the hostname, or a redirect, resolved to a private or reserved address)',
    verdict: 'No evidence',
    tone: 'none',
    why: 'The monitor refuses to connect, so nothing about the site was learned. It neither adds uptime nor takes it away.',
  },
  {
    came: 'A status in the endpoint’s accepted list (200–399 unless you change it)',
    verdict: 'Up',
    tone: 'up',
    why: 'The site answered the way you said it should. This is tested first, so an endpoint that accepts 403 keeps a real signal.',
  },
  {
    came: 'A bot-challenge page (a cf-mitigated or x-amzn-waf-action challenge header)',
    verdict: 'No evidence',
    tone: 'none',
    why: 'The check met a wall in front of the site, not the site. It neither adds uptime nor takes it away.',
  },
  {
    came: 'Any other status',
    verdict: 'Down',
    tone: 'down',
    why: 'The site answered, and the answer was wrong.',
  },
  {
    came: 'A timeout, or a DNS, connection or TLS error',
    verdict: 'Down',
    tone: 'down',
    why: 'No answer is still evidence about the site.',
  },
]

/** verdictFor in lib/format.ts: the first that applies wins. */
const LADDER: { name: string; when: string; color?: string }[] = [
  { name: 'Not monitored', when: 'Paused or deleted, unless it left an incident open.' },
  { name: 'Pending', when: 'Added, and no check has run yet.' },
  { name: 'Stale', when: 'No check for over two minutes, so the last answer is too old to trust.', color: STATUS.warn },
  { name: 'The latest check', when: 'Otherwise the newest check speaks: up, down or no evidence.' },
]

export default function VerdictsView() {
  return (
    <div className="space-y-3">
      <div className="panel-flush">
        <div className="panel-head">
          <span className="text-[13px] font-semibold text-txt-hi">How one check is called</span>
          <span className="hidden text-[11.5px] text-txt-lo sm:inline">in this order, every minute, for every endpoint</span>
        </div>
        <ul className="divide-y divide-white/[0.05]">
          {RULES.map((r) => (
            <li key={r.came} className="grid gap-x-6 gap-y-1.5 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_7.5rem_minmax(0,1.3fr)] md:items-baseline">
              <p className="text-[13px] text-txt-hi">{r.came}</p>
              <p>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[12px] font-medium"
                  style={{ color: TONE[r.tone], borderColor: `${TONE[r.tone]}59`, backgroundColor: `${TONE[r.tone]}12` }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TONE[r.tone] }} />
                  {r.verdict}
                </span>
              </p>
              <p className="text-[12.5px] leading-relaxed text-txt-mid">{r.why}</p>
            </li>
          ))}
        </ul>
      </div>

      <StreakSandbox />

      <div className="panel p-4">
        <p className="text-[13px] font-semibold text-txt-hi">What an endpoint shows</p>
        <p className="mt-1 text-[12.5px] text-txt-lo">The first of these that applies wins, so missing evidence never reads as up.</p>
        <ol className="mt-3.5 grid gap-2 md:grid-cols-4 md:gap-0">
          {LADDER.map((step, i) => (
            <li key={step.name} className="flex items-stretch">
              <div className="flex-1 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                <p className="font-display text-[13px] font-semibold" style={{ color: step.color ?? '#eceef0' }}>
                  {step.name}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-txt-mid">{step.when}</p>
              </div>
              {i < LADDER.length - 1 && <ChevronRight className="mx-1 hidden h-4 w-4 shrink-0 self-center text-txt-dim md:block" aria-hidden />}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

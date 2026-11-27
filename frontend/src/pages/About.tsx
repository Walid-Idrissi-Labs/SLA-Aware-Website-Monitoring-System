import { useEffect, useRef, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import Shell from '../components/Shell'
import RubberSegment from '../components/RubberSegment'
import ArchDiagram, { type LayerChoice } from '../about/ArchDiagram'
import VerdictsView from '../about/VerdictsView'
import CoverageView from '../about/CoverageView'
import { LAYERS, REPO, STEPS, nodeById } from '../about/archData'
import { ABOUT_VIEWS } from '../about/views'

type View = (typeof ABOUT_VIEWS)[number]['value']

const PRINCIPLES: { title: string; body: string }[] = [
  { title: 'No servers to keep alive', body: 'Functions, managed tables and a static front end. Idle, it costs close to nothing.' },
  { title: 'One job per function', body: 'The function that checks sites never writes reports, so a fault in one path cannot quietly corrupt another.' },
  { title: 'Least privilege', body: 'Each role reaches only the tables and actions its function uses. Select a function above to see its list.' },
  { title: 'Rebuilt from code', body: 'Terraform defines every AWS resource, so the stack can be built from nothing and torn down with one apply.' },
]

function SpecChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 text-[11.5px] font-medium text-txt-mid">
      {children}
    </span>
  )
}

export default function About() {
  const { view: param } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const current = ABOUT_VIEWS.find((v) => v.value === param) ?? ABOUT_VIEWS[0]
  const view: View = current.value

  // On a phone the switch scrolls sideways: keep the chosen view in sight, without moving the page.
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = strip.current
    const on = el?.querySelector<HTMLElement>('[aria-checked="true"]')
    if (el && on && el.scrollWidth > el.clientWidth) el.scrollLeft = on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2
  }, [view])

  // Every state is a link: ?layer=&node= on the architecture, ?step= on the walkthrough.
  const layerParam = params.get('layer')
  const layer = (LAYERS.some((l) => l.id === layerParam) ? layerParam : 'all') as LayerChoice
  const nodeParam = params.get('node')
  const selected = nodeParam && nodeById.has(nodeParam) ? nodeParam : null
  const stepParam = Number(params.get('step'))
  const step = Number.isInteger(stepParam) && stepParam >= 1 && stepParam <= STEPS.length ? stepParam - 1 : 0
  const patch = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v == null) p.delete(k)
      else p.set(k, v)
    }
    setParams(p, { replace: true })
  }

  return (
    <Shell>
      <div className="mx-auto w-full max-w-[1360px]">
        <div className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
          <div className="max-w-3xl">
            <p className="mb-1.5 text-[12px] font-medium text-accent">About</p>
            <h1 className="font-display text-[24px] font-semibold tracking-[-0.02em] text-txt-hi">How SLA Monitor works</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-txt-lo">
              A serverless uptime and SLA monitor: AWS behind the API, a static React app in front. Every minute it checks each endpoint you
              add and calls the answer up, down or no evidence. A few failures in a row open an incident and email you, and the first passing
              check closes it. Every Monday, and whenever you ask, it rolls the week into an SLA report against your own targets.
            </p>
          </div>
          <a href={REPO} target="_blank" rel="noreferrer" className="btn-ghost h-8 shrink-0 px-3 text-[12.5px]">
            Source on GitHub
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 animate-fade-up" style={{ animationDelay: '60ms' }}>
          <SpecChip>5 Lambda functions</SpecChip>
          <SpecChip>5 DynamoDB tables</SpecChip>
          <SpecChip>14 API routes</SpecChip>
          <SpecChip>1 region</SpecChip>
          <SpecChip>100% Terraform</SpecChip>
        </div>

        <div className="mt-5 animate-fade-up" style={{ animationDelay: '100ms' }}>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Its natural width, scrolled sideways on a phone rather than squeezed. */}
            <div ref={strip} className="-mx-1 max-w-full overflow-x-auto px-1 pb-0.5">
              <RubberSegment
                className="w-max"
                items={ABOUT_VIEWS.map(({ value, label }) => ({ value, label }))}
                value={view}
                onChange={(v) => navigate(ABOUT_VIEWS.find((x) => x.value === v)!.path)}
                size="md"
                aria-label="View"
              />
            </div>
            <p className="min-w-0 flex-1 basis-64 text-[12.5px] leading-relaxed text-txt-lo">{current.blurb}</p>
          </div>

          {(view === 'architecture' || view === 'check') && (
            <ArchDiagram
              mode={view}
              layer={layer}
              onLayer={(l) => patch({ layer: l === 'all' ? null : l })}
              selected={selected}
              onSelect={(id) => patch({ node: id })}
              step={step}
              onStep={(i) => patch({ step: String(i + 1) })}
            />
          )}
          {view === 'verdicts' && <VerdictsView />}
          {view === 'coverage' && <CoverageView />}

          {view === 'architecture' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {PRINCIPLES.map((p) => (
                <div key={p.title} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-4">
                  <p className="font-display text-[13px] font-semibold text-txt-hi">{p.title}</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-txt-mid">{p.body}</p>
                </div>
              ))}
            </div>
          )}
          <p className="mb-2 mt-4 text-[11.5px] text-txt-lo">These views are illustrative: none of them reads your endpoints.</p>
        </div>
      </div>
    </Shell>
  )
}

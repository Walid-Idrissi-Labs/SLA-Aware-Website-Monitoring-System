import { ArrowRight, ArrowUpRight, X } from 'lucide-react'
import { EDGES, REPO, nodeById, type ArchNode } from './archData'

/** `modules/cognito/main.tf` reads better than a bare `main.tf`. */
function fileLabel(path: string): string {
  const parts = path.split('/')
  const file = parts[parts.length - 1]
  return /^(main\.tf|handler\.py)$/.test(file) ? parts.slice(-2).join('/') : file
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="micro mb-1.5">{label}</p>
      {children}
    </div>
  )
}

export default function NodeDetail({ node, onClose, onSelect }: { node: ArchNode; onClose: () => void; onSelect: (id: string) => void }) {
  const Icon = node.icon
  const out = EDGES.filter((e) => e.from === node.id)
  const inbound = EDGES.filter((e) => e.to === node.id)

  return (
    <div className="flex h-full flex-col">
      <div className="panel-head shrink-0">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-accent/30 bg-accent/[0.08] text-accent">
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-[13px] font-semibold text-txt-hi">{node.title}</p>
            <p className="truncate font-mono text-[10.5px] text-txt-lo">{node.sub}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close details" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-txt-lo transition-colors hover:bg-white/[0.05] hover:text-txt-hi">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        <p className="text-[13px] leading-relaxed text-txt-mid">{node.what}</p>

        {node.trigger && (
          <Row label="Runs on">
            <p className="text-[12.5px] text-txt-hi">{node.trigger}</p>
          </Row>
        )}

        {node.grants && (
          <Row label="Allowed to">
            <ul className="space-y-1">
              {node.grants.map((g) => (
                <li key={g} className="font-mono text-[11px] leading-relaxed text-txt-mid">
                  {g}
                </li>
              ))}
            </ul>
          </Row>
        )}

        {node.routes && (
          <Row label="Routes">
            <ul className="space-y-1">
              {node.routes.map((r) => (
                <li key={r.method + r.path} className="flex items-baseline gap-2 font-mono text-[11px]">
                  <span className={`w-12 shrink-0 text-[10px] ${r.method === 'GET' ? 'text-txt-lo' : 'text-accent'}`}>{r.method}</span>
                  <span className="break-all text-txt-hi">{r.path}</span>
                </li>
              ))}
            </ul>
          </Row>
        )}

        {(out.length > 0 || inbound.length > 0) && (
          <Row label="Connections">
            <ul className="space-y-2">
              {[...inbound, ...out].map((e) => {
                const other = nodeById.get(e.from === node.id ? e.to : e.from)!
                return (
                  <li key={e.id} className="text-[12px] leading-relaxed">
                    <button
                      type="button"
                      onClick={() => onSelect(other.id)}
                      className="inline-flex items-center gap-1.5 font-medium text-txt-hi underline-offset-2 hover:text-accent hover:underline"
                    >
                      {e.to === node.id && <span className="text-txt-lo">from</span>}
                      {e.from === node.id && <ArrowRight className="h-3 w-3 text-txt-lo" />}
                      {other.title}
                    </button>
                    <span className="text-txt-mid">: {e.detail}</span>
                  </li>
                )
              })}
            </ul>
          </Row>
        )}

        {node.proof && (
          <Row label="In the code">
            <ul className="space-y-1">
              {node.proof.map((p) => (
                <li key={p.path + p.symbol}>
                  <a
                    href={`${REPO}/blob/main/${p.path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group inline-flex items-center gap-1 font-mono text-[11px] text-txt-mid hover:text-accent"
                  >
                    <span className="text-txt-lo group-hover:text-accent">{fileLabel(p.path)}</span>
                    <span>· {p.symbol}</span>
                    <ArrowUpRight className="h-2.5 w-2.5" />
                  </a>
                  <span className="ml-1.5 text-[11px] text-txt-lo">{p.label}</span>
                </li>
              ))}
            </ul>
          </Row>
        )}
      </div>
    </div>
  )
}

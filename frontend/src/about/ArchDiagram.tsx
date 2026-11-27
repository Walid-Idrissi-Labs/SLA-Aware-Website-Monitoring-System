import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, List, Maximize2, Minus, Plus, Workflow } from 'lucide-react'
import { EDGES, FRAME, H, LAYERS, NODES, STEPS, TABLES, W, nodeById, type ArchEdge, type ArchNode, type LayerId } from './archData'
import { useViewport } from './useViewport'
import NodeDetail from './NodeDetail'

export type DiagramMode = 'architecture' | 'check'
export type LayerChoice = LayerId | 'all'

interface Props {
  mode: DiagramMode
  layer: LayerChoice
  onLayer: (layer: LayerChoice) => void
  selected: string | null
  onSelect: (id: string | null) => void
  /** Life of a check: the step on screen, 0-based. */
  step: number
  onStep: (step: number) => void
}

type EdgeState = 'idle' | 'dim' | 'hover' | 'lit' | 'earlier'
type NodeState = 'idle' | 'dim' | 'lit' | 'selected'

const STROKE: Record<EdgeState, string> = {
  idle: 'rgba(255,255,255,0.22)',
  dim: 'rgba(255,255,255,0.07)',
  hover: 'rgba(255,255,255,0.55)',
  lit: '#fa5c29',
  earlier: 'rgba(250,92,41,0.38)',
}

/** An orthogonal polyline with its corners rounded. */
function roundPath(pts: [number, number][], r = 8): string {
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    const l1 = Math.hypot(x1 - x0, y1 - y0)
    const l2 = Math.hypot(x2 - x1, y2 - y1)
    const k = Math.min(r, l1 / 2, l2 / 2)
    d += ` L${x1 - ((x1 - x0) / l1) * k},${y1 - ((y1 - y0) / l1) * k} Q${x1},${y1} ${x1 + ((x2 - x1) / l2) * k},${y1 + ((y2 - y1) / l2) * k}`
  }
  const [xn, yn] = pts[pts.length - 1]
  return `${d} L${xn},${yn}`
}

function arrowHead(pts: [number, number][]) {
  const [x0, y0] = pts[pts.length - 2]
  const [x1, y1] = pts[pts.length - 1]
  return `translate(${x1},${y1}) rotate(${(Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI})`
}

/** Middle of the longest segment, where a label has the most room. */
function labelPoint(e: ArchEdge): [number, number] {
  if (e.labelAt) return e.labelAt
  let best = 0
  let at: [number, number] = e.points[0]
  for (let i = 1; i < e.points.length; i++) {
    const [x0, y0] = e.points[i - 1]
    const [x1, y1] = e.points[i]
    const len = Math.hypot(x1 - x0, y1 - y0)
    if (len > best) {
      best = len
      at = [(x0 + x1) / 2, (y0 + y1) / 2]
    }
  }
  return at
}

const touches = (e: ArchEdge, id: string) => e.from === id || e.to === id

function useSmallScreen() {
  const query = '(max-width: 639px)'
  const [small, setSmall] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setSmall(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return small
}

export default function ArchDiagram(props: Props) {
  const { mode, layer, onLayer, step, onStep } = props
  const small = useSmallScreen()
  const [asList, setAsList] = useState(true)
  const list = small && asList
  const current = STEPS[step]

  return (
    <div className="panel-flush">
      <div className="panel-head">
        {list && mode === 'architecture' ? (
          <p className="min-w-0 truncate text-[12.5px] text-txt-mid">Every box, by where it runs</p>
        ) : mode === 'architecture' ? (
          <div role="radiogroup" aria-label="Layer" className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1">
            {LAYERS.map((l) => {
              const on = layer === l.id
              const count = l.id === 'all' ? EDGES.length : EDGES.filter((e) => e.layers.includes(l.id as LayerId)).length
              return (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onLayer(l.id)}
                  className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors ${
                    on ? 'border-accent/30 bg-accent/[0.08] text-accent' : 'border-transparent text-txt-mid hover:bg-white/[0.04] hover:text-txt-hi'
                  }`}
                >
                  {l.label}
                  {l.id !== 'logs' && <span className={`font-mono text-[10px] ${on ? 'text-accent/70' : 'text-txt-lo'}`}>{count}</span>}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="min-w-0 truncate text-[12.5px] text-txt-mid">
            <span className="font-mono text-[11px] text-accent">
              {String(step + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
            </span>
            <span className="ml-2.5 font-display font-semibold text-txt-hi">{current.title}</span>
          </p>
        )}
        {small && (
          <div className="flex shrink-0 rounded-md border border-white/[0.08] p-0.5" role="radiogroup" aria-label="Show as">
            {[
              { list: true, label: 'List', icon: List },
              { list: false, label: 'Diagram', icon: Workflow },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={asList === o.list}
                onClick={() => setAsList(o.list)}
                className={`flex h-6 items-center gap-1 rounded px-2 text-[11.5px] ${asList === o.list ? 'bg-white/[0.07] text-txt-hi' : 'text-txt-lo'}`}
              >
                <o.icon className="h-3 w-3" />
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {list ? <ArchList {...props} /> : <Canvas {...props} small={small} />}

      {mode === 'check' && (
        <div className="border-t border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-3">
            <button type="button" className="btn-ghost h-8 px-2.5" onClick={() => onStep(Math.max(0, step - 1))} disabled={step === 0} aria-label="Previous step">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <ol className="flex min-w-0 flex-1 items-center" aria-label="Steps">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex flex-1 items-center last:flex-none">
                  <button
                    type="button"
                    onClick={() => onStep(i)}
                    aria-label={`Step ${i + 1}: ${s.title}`}
                    aria-current={i === step ? 'step' : undefined}
                    className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border font-mono text-[10.5px] transition-colors ${
                      i === step
                        ? 'border-transparent bg-accent text-white'
                        : i < step
                          ? 'border-accent/40 text-txt-mid hover:text-txt-hi'
                          : 'border-white/[0.1] text-txt-lo hover:text-txt-mid'
                    }`}
                  >
                    {i + 1}
                  </button>
                  {i < STEPS.length - 1 && <span className={`mx-1 h-px flex-1 ${i < step ? 'bg-accent/40' : 'bg-white/[0.08]'}`} />}
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="btn-ghost h-8 px-2.5"
              onClick={() => onStep(Math.min(STEPS.length - 1, step + 1))}
              disabled={step === STEPS.length - 1}
              aria-label="Next step"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-txt-mid" aria-live="polite">
            {current.body}
          </p>
        </div>
      )}

      {!list && (
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-white/[0.06] px-4 py-2 font-mono text-[10.5px] text-txt-lo">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5">
              <svg width="22" height="6" aria-hidden>
                <line x1="0" y1="3" x2="22" y2="3" stroke="rgba(255,255,255,0.4)" strokeWidth="1.25" />
              </svg>
              every run
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="22" height="6" aria-hidden>
                <line x1="0" y1="3" x2="22" y2="3" stroke="rgba(255,255,255,0.4)" strokeWidth="1.25" strokeDasharray="5 5" />
              </svg>
              only when needed
            </span>
            <span>one IAM role per function</span>
          </span>
          <span className="hidden md:inline">drag to pan · ⌘ or Ctrl + scroll to zoom</span>
        </div>
      )}
    </div>
  )
}

function useLighting({ mode, layer, selected, step }: Props, hover: string | null) {
  return useMemo(() => {
    const edge = new Map<string, EdgeState>()
    const node = new Map<string, NodeState>()
    const tables = new Set<string>()

    if (mode === 'check') {
      const now = new Set(STEPS[step].edges)
      const before = new Set(STEPS.slice(0, step).flatMap((s) => s.edges))
      const seen = new Set(STEPS.slice(0, step + 1).flatMap((s) => s.nodes))
      for (const e of EDGES) edge.set(e.id, now.has(e.id) ? 'lit' : before.has(e.id) ? 'earlier' : 'dim')
      for (const n of NODES) node.set(n.id, STEPS[step].nodes.includes(n.id) ? 'lit' : seen.has(n.id) ? 'idle' : 'dim')
      for (const e of EDGES) if (now.has(e.id)) e.tables?.forEach((t) => tables.add(t))
      return { edge, node, tables }
    }

    const inLayer = (e: ArchEdge) => layer === 'all' || e.layers.includes(layer)
    const layerNodes =
      layer === 'all'
        ? null
        : new Set([...EDGES.filter(inLayer).flatMap((e) => [e.from, e.to]), ...NODES.filter((n) => n.layers?.includes(layer)).map((n) => n.id)])
    for (const e of EDGES) {
      edge.set(
        e.id,
        selected && touches(e, selected) ? 'lit' : !inLayer(e) ? 'dim' : hover && touches(e, hover) ? 'hover' : 'idle',
      )
      if (selected && touches(e, selected)) e.tables?.forEach((t) => tables.add(t))
    }
    for (const n of NODES) {
      const near = (id: string | null) => id != null && EDGES.some((e) => touches(e, id) && touches(e, n.id))
      node.set(
        n.id,
        n.id === selected
          ? 'selected'
          : layerNodes && !layerNodes.has(n.id)
            ? 'dim'
            : near(selected) || near(hover) || (layer !== 'all' && n.layers?.includes(layer))
              ? 'lit'
              : 'idle',
      )
    }
    return { edge, node, tables }
  }, [mode, layer, selected, step, hover])
}

function Canvas(props: Props & { small: boolean }) {
  const { mode, selected, onSelect, small } = props
  const { ref, view, fit, zoomAt, panBy } = useViewport(W, H, small ? 'height' : 'fit')
  const [hover, setHover] = useState<string | null>(null)
  const [smooth, setSmooth] = useState(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ moved: boolean; dist: number } | null>(null)
  const { edge, node, tables } = useLighting(props, hover)
  const detail = mode === 'architecture' && selected ? nodeById.get(selected) : undefined

  // Programmatic moves glide; drags and wheel zooms follow the hand.
  const glide = (fn: () => void) => {
    setSmooth(true)
    fn()
  }

  // ⌘/Ctrl + wheel (and trackpad pinch) zooms; a plain wheel scrolls the page.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      setSmooth(false)
      zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, zoomAt])

  // A box chosen under the open detail panel slides into the visible part, once
  // per selection; closing the panel fits the view back if that slide moved it.
  const slid = useRef<{ id: string; moved: boolean } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!detail) {
      if (slid.current?.moved) glide(fit)
      slid.current = null
      return
    }
    if (!view || !el || window.innerWidth < 1024 || slid.current?.id === detail.id) return
    const visible = el.clientWidth - 344
    const cx = view.x + (detail.x + detail.w / 2) * view.s
    const moved = cx > visible - 24
    slid.current = { id: detail.id, moved: moved || !!slid.current?.moved }
    if (moved) glide(() => panBy(visible / 2 - cx, 0))
    // Reacts to the selection and to the first measure only, not to every pan.
  }, [detail, view != null])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    drag.current = { moved: false, dist: 0 }
    setSmooth(false)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(e.pointerId)
    if (!last || !drag.current) return
    const pts = [...pointers.current.values()]
    if (pts.length === 2) {
      const other = pts.find((p) => p !== last)!
      const before = Math.hypot(last.x - other.x, last.y - other.y)
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y)
      const r = ref.current!.getBoundingClientRect()
      if (before > 0) zoomAt(after / before, (e.clientX + other.x) / 2 - r.left, (e.clientY + other.y) / 2 - r.top)
      drag.current.moved = true
    } else {
      const dx = e.clientX - last.x
      const dy = e.clientY - last.y
      drag.current.dist += Math.abs(dx) + Math.abs(dy)
      if (!drag.current.moved && drag.current.dist > 4) {
        drag.current.moved = true
        // Captured only once it is a drag, so a plain click still reaches the box.
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      if (drag.current.moved) panBy(dx, dy)
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) setTimeout(() => (drag.current = null))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 60
    const keys: Record<string, () => void> = {
      ArrowLeft: () => panBy(step, 0),
      ArrowRight: () => panBy(-step, 0),
      ArrowUp: () => panBy(0, step),
      ArrowDown: () => panBy(0, -step),
      '+': () => zoomAt(1.2),
      '=': () => zoomAt(1.2),
      '-': () => zoomAt(1 / 1.2),
      '0': fit,
      Escape: () => onSelect(null),
    }
    const run = keys[e.key]
    if (!run) return
    e.preventDefault()
    glide(run)
  }

  return (
    <div className="relative">
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label="Architecture diagram. Arrow keys pan, plus and minus zoom, 0 fits it back."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="relative w-full cursor-grab touch-none overflow-hidden bg-ink-850 outline-none active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/50"
        style={{
          aspectRatio: small ? undefined : `${W} / ${H}`,
          height: small ? '70vh' : undefined,
          maxHeight: '78vh',
          minHeight: 340,
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)',
          backgroundSize: view ? `${20 * view.s}px ${20 * view.s}px` : '20px 20px',
          backgroundPosition: view ? `${view.x}px ${view.y}px` : undefined,
        }}
      >
        {view && (
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: W,
              height: H,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
              transition: smooth ? 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1)' : undefined,
            }}
          >
            <svg width={W} height={H} className="absolute inset-0 overflow-visible" aria-hidden>
              <rect x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} rx={14} fill="rgba(255,255,255,0.012)" stroke="rgba(255,255,255,0.09)" />
              {EDGES.map((e) => {
                const state = edge.get(e.id)!
                const d = roundPath(e.points)
                const color = state === 'lit' ? STROKE.idle : STROKE[state]
                return (
                  <g key={e.id}>
                    <path d={d} fill="none" stroke={color} strokeWidth={1.25} strokeDasharray={e.dashed ? '5 5' : undefined} />
                    <path d="M-7,-4 L0,0 L-7,4" transform={arrowHead(e.points)} fill="none" stroke={color} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                )
              })}
              {/* The lit path draws once along the direction of travel, then rests. */}
              {EDGES.filter((e) => edge.get(e.id) === 'lit').map((e) => {
                const d = roundPath(e.points)
                return (
                  <g key={`lit-${e.id}`}>
                    {e.dashed ? (
                      <>
                        <mask id={`arch-m-${e.id}`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
                          <path d={d} pathLength={1} className="arch-draw" fill="none" stroke="#fff" strokeWidth={6} />
                        </mask>
                        <path d={d} fill="none" stroke={STROKE.lit} strokeWidth={1.75} strokeDasharray="5 5" mask={`url(#arch-m-${e.id})`} />
                      </>
                    ) : (
                      <path d={d} pathLength={1} className="arch-draw" fill="none" stroke={STROKE.lit} strokeWidth={1.75} />
                    )}
                    <path
                      d="M-7,-4 L0,0 L-7,4"
                      transform={arrowHead(e.points)}
                      className="arch-head"
                      fill="none"
                      stroke={STROKE.lit}
                      strokeWidth={1.75}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                )
              })}
            </svg>

            <span
              className="absolute flex items-baseline gap-1.5 bg-ink-850 px-2 leading-none"
              style={{ left: FRAME.x + 18, top: FRAME.y - 7 }}
            >
              <span className="font-display text-[12px] font-semibold text-txt-hi">AWS</span>
              <span className="font-mono text-[11px] text-txt-lo">us-east-1</span>
            </span>

            {EDGES.map((e) => {
              const state = edge.get(e.id)!
              if (state === 'dim') return null
              const [x, y] = labelPoint(e)
              return (
                <span
                  key={e.id}
                  className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded border bg-ink-850 px-1.5 py-[3px] font-mono text-[10px] leading-none transition-colors ${
                    state === 'lit' ? 'border-accent/40 text-txt-hi' : state === 'earlier' ? 'border-accent/20 text-txt-mid' : 'border-white/[0.08] text-txt-mid'
                  }`}
                  style={{ left: x, top: y }}
                >
                  {e.label}
                </span>
              )
            })}

            {NODES.map((n) => (
              <NodeBox
                key={n.id}
                n={n}
                state={node.get(n.id)!}
                litTables={tables}
                interactive={mode === 'architecture'}
                onSelect={() => !drag.current?.moved && onSelect(n.id === selected ? null : n.id)}
                onHover={(on) => setHover(on ? n.id : null)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="absolute right-3 top-3 flex items-center rounded-md border border-white/[0.08] bg-ink-800/95">
        <button type="button" aria-label="Zoom out" onClick={() => glide(() => zoomAt(1 / 1.2))} className="grid h-7 w-7 place-items-center text-txt-mid hover:text-txt-hi">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-11 text-center font-mono text-[11px] text-txt-mid">
          {view ? Math.round(view.s * 100) : 100}%
        </span>
        <button type="button" aria-label="Zoom in" onClick={() => glide(() => zoomAt(1.2))} className="grid h-7 w-7 place-items-center text-txt-mid hover:text-txt-hi">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <span className="h-4 w-px bg-white/[0.08]" />
        <button type="button" aria-label="Fit to view" onClick={() => glide(fit)} className="flex h-7 items-center gap-1.5 px-2 text-[11.5px] text-txt-mid hover:text-txt-hi">
          <Maximize2 className="h-3 w-3" />
          Fit
        </button>
      </div>

      {detail && (
        <div className="panel border-t border-white/[0.06] lg:absolute lg:bottom-3 lg:right-3 lg:top-14 lg:w-[320px] lg:animate-scale-in lg:shadow-panel-hover">
          <NodeDetail node={detail} onClose={() => onSelect(null)} onSelect={onSelect} />
        </div>
      )}
    </div>
  )
}

function NodeBox({
  n,
  state,
  litTables,
  interactive,
  onSelect,
  onHover,
}: {
  n: ArchNode
  state: NodeState
  litTables: Set<string>
  interactive: boolean
  onSelect: () => void
  onHover: (on: boolean) => void
}) {
  const Icon = n.icon
  const out = EDGES.filter((e) => e.from === n.id).map((e) => nodeById.get(e.to)!.title)
  const tone = {
    idle: n.external ? 'border-dashed border-white/[0.14] bg-ink-850' : 'border-white/[0.07] bg-ink-800',
    lit: `${n.external ? 'border-dashed bg-ink-850' : 'bg-ink-800'} border-white/[0.18]`,
    selected: 'border-accent/60 bg-[#1a1210] shadow-glow-accent',
    dim: `${n.external ? 'border-dashed bg-ink-850' : 'bg-ink-800'} border-white/[0.07] opacity-25`,
  }[state]
  const well =
    state === 'selected' ? 'border-accent/30 bg-accent/[0.08] text-accent' : state === 'lit' ? 'border-white/[0.1] text-accent' : 'border-white/[0.08] text-txt-mid'
  const Tag = interactive ? 'button' : 'div'
  const wide = n.id === 'dynamo' || n.id === 'logs'

  return (
    <Tag
      {...(interactive
        ? {
            type: 'button' as const,
            onClick: onSelect,
            'aria-pressed': state === 'selected',
            'aria-label': `${n.title}, ${n.sub}.${out.length ? ` Sends to: ${out.join(', ')}.` : ''}`,
          }
        : {})}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={`absolute flex rounded-lg border text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[border-color,background-color,opacity,box-shadow] duration-150 ${tone} ${
        interactive ? 'hover:border-white/[0.18] hover:bg-ink-750 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60' : ''
      } ${wide ? 'items-center gap-4 px-3' : 'items-center gap-2.5 px-3'}`}
      style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border bg-white/[0.02] transition-colors ${well}`}>
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className={`min-w-0 ${wide ? 'flex items-baseline gap-2.5' : ''}`}>
        <span className="block truncate font-display text-[13px] font-semibold text-txt-hi">{n.title}</span>
        <span className="block truncate font-mono text-[10.5px] text-txt-lo">{n.sub}</span>
      </span>
      {n.id === 'dynamo' && (
        <span className="ml-auto flex flex-wrap justify-end gap-1.5">
          {TABLES.map((t) => (
            <span
              key={t}
              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                litTables.has(t) ? 'border-accent/40 text-accent' : 'border-white/[0.07] text-txt-mid'
              }`}
            >
              {t}
            </span>
          ))}
        </span>
      )}
    </Tag>
  )
}

/** Phones: the same data as a list, which is also what a screen reader gets most from. */
function ArchList({ mode, step, selected, onSelect }: Props) {
  const groups: { id: ArchNode['group']; title: string }[] = [
    { id: 'outside', title: 'Outside AWS' },
    { id: 'edge', title: 'Front door and clock' },
    { id: 'functions', title: 'Functions' },
    { id: 'state', title: 'State and delivery' },
  ]
  const lit = mode === 'check' ? new Set(STEPS[step].nodes) : null

  return (
    <div className="space-y-4 p-3">
      {groups.map((g) => (
        <div key={g.id}>
          <p className="micro mb-2 px-1">{g.title}</p>
          <div className="space-y-1.5">
            {NODES.filter((n) => n.group === g.id).map((n) => {
              const Icon = n.icon
              const out = EDGES.filter((e) => e.from === n.id)
              const on = lit ? lit.has(n.id) : false
              return (
                <details
                  key={n.id}
                  open={selected === n.id}
                  onToggle={(e) => {
                    const open = (e.currentTarget as HTMLDetailsElement).open
                    if (open && selected !== n.id) onSelect(n.id)
                    if (!open && selected === n.id) onSelect(null)
                  }}
                  className={`rounded-lg border bg-ink-800 ${on ? 'border-accent/40' : 'border-white/[0.07]'}`}
                >
                  <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-2.5 px-3">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/[0.08] ${on ? 'text-accent' : 'text-txt-mid'}`}>
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-display text-[13px] font-semibold text-txt-hi">{n.title}</span>
                      <span className="block truncate font-mono text-[10.5px] text-txt-lo">{n.sub}</span>
                    </span>
                  </summary>
                  <div className="space-y-3 border-t border-white/[0.06] px-3 pb-3 pt-2.5">
                    <p className="text-[12.5px] leading-relaxed text-txt-mid">{n.what}</p>
                    {out.length > 0 && (
                      <ul className="space-y-1.5">
                        {out.map((e) => (
                          <li key={e.id} className="text-[12px] leading-relaxed">
                            <span className="inline-flex items-center gap-1 font-medium text-txt-hi">
                              <ArrowRight className="h-3 w-3 text-txt-lo" />
                              {nodeById.get(e.to)!.title}
                            </span>
                            <span className="text-txt-lo">: {e.detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

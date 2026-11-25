import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, TriangleAlert } from 'lucide-react'

export type ActionState = 'idle' | 'loading' | 'success' | 'error'

interface Props {
  children: ReactNode
  /** Run on click. If it returns a promise the button drives its own state:
   *  loading → success or error → back to idle. A sync handler just runs. */
  onAction?: () => unknown
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  labels?: { loading?: ReactNode; success?: ReactNode; error?: ReactNode }
  /** Controlled state, for callers that already know the outcome. */
  state?: ActionState
  disabled?: boolean
  type?: 'button' | 'submit'
  fullWidth?: boolean
  className?: string
  title?: string
}

const SIZE = {
  sm: 'h-8 px-3 text-[12.5px] gap-1.5 rounded-[9px]',
  md: 'h-9 px-3.5 text-[13px] gap-2 rounded-[10px]',
  lg: 'h-11 px-4 text-[13.5px] gap-2 rounded-[11px]',
} as const

/** Idle surfaces. State surfaces override the background, border and colour. */
const VARIANT = {
  primary:
    'text-white bg-[linear-gradient(180deg,#ff8358_0%,#fa5c29_52%,#ea4f16_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.32),inset_0_-1px_0_rgba(0,0,0,0.16),0_1px_2px_rgba(0,0,0,0.45),0_10px_24px_-10px_rgba(250,92,41,0.8)] hover:brightness-[1.07]',
  secondary:
    'text-txt-mid bg-white/[0.035] border border-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:bg-white/[0.06] hover:text-txt-hi hover:border-white/[0.14]',
  danger:
    'text-crit bg-crit/[0.08] border border-crit/25 hover:bg-crit/[0.14]',
} as const

const STATE_SURFACE: Record<Exclude<ActionState, 'idle'>, string> = {
  loading: '',
  success: 'text-ok bg-ok/[0.12] border border-ok/30 shadow-none hover:brightness-100',
  error: 'text-crit bg-crit/[0.12] border border-crit/30 shadow-none hover:brightness-100',
}

const STACK = 'col-start-1 row-start-1 inline-flex items-center gap-2 whitespace-nowrap'

/**
 * Primary/secondary action button with a four-state lifecycle.
 *
 * Every label and icon variant is rendered, stacked in the same grid cell and
 * cross-faded. That means the button's width is the widest of its states, so
 * going idle → "Refreshing…" → "Updated" never shifts the layout around it and
 * nothing outside the button reflows.
 */
export default function ActionButton({
  children,
  onAction,
  variant = 'primary',
  size = 'md',
  icon,
  labels,
  state,
  disabled = false,
  type = 'button',
  fullWidth = false,
  className = '',
  title,
}: Props) {
  const [inner, setInner] = useState<ActionState>('idle')
  const current = state ?? inner
  const timer = useRef<number | undefined>(undefined)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      window.clearTimeout(timer.current)
    }
  }, [])

  const run = async () => {
    if (current !== 'idle' || disabled) return
    let result: unknown
    try {
      result = onAction?.()
    } catch {
      setInner('error')
      timer.current = window.setTimeout(() => alive.current && setInner('idle'), 1600)
      return
    }
    // A promise means the caller wants the lifecycle; anything else was a
    // plain click (opening a dialog, navigating) and stays idle.
    if (!result || typeof (result as PromiseLike<unknown>).then !== 'function') return
    setInner('loading')
    try {
      await result
      if (!alive.current) return
      setInner('success')
    } catch {
      if (!alive.current) return
      setInner('error')
    }
    timer.current = window.setTimeout(() => alive.current && setInner('idle'), 1600)
  }

  const surface =
    current === 'idle'
      ? VARIANT[variant]
      : current === 'loading'
        ? `${VARIANT[variant]} opacity-90`
        : STATE_SURFACE[current]

  const iconSlot = (
    <span className="grid flex-none place-items-center">
      <span className={`${STACK} justify-center ${current === 'idle' ? 'opacity-100' : 'opacity-0'}`} aria-hidden>
        {icon}
      </span>
      <span
        className={`${STACK} col-start-1 justify-center ${current === 'loading' ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden
      >
        {/* Spin only while shown: at opacity 0 the animation still wakes the GPU every frame. */}
        <span
          className={`h-3.5 w-3.5 rounded-full border-[1.6px] border-current border-t-transparent ${current === 'loading' ? 'animate-spin' : ''}`}
        />
      </span>
      <span
        className={`${STACK} col-start-1 justify-center ${current === 'success' ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
      </span>
      <span
        className={`${STACK} col-start-1 justify-center ${current === 'error' ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden
      >
        <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
    </span>
  )

  const label = (shown: boolean, text: ReactNode) => (
    <span className={`${STACK} ${shown ? 'opacity-100' : 'opacity-0'}`} aria-hidden={!shown}>
      {text}
    </span>
  )

  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      aria-busy={current === 'loading' || undefined}
      data-state={current}
      onClick={run}
      className={`inline-flex items-center justify-center font-medium tracking-[0.005em] transition-[filter,transform,background-color,border-color,color,box-shadow] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${SIZE[size]} ${surface} ${fullWidth ? 'w-full' : ''} ${className}`.trim()}
    >
      {iconSlot}
      <span className="grid">
        {label(current === 'idle', children)}
        {label(current === 'loading', labels?.loading ?? children)}
        {label(current === 'success', labels?.success ?? 'Done')}
        {label(current === 'error', labels?.error ?? 'Failed')}
      </span>
      <span className="sr-only" aria-live="polite">
        {current === 'loading' ? 'Working' : current === 'success' ? 'Done' : current === 'error' ? 'Failed' : ''}
      </span>
    </button>
  )
}

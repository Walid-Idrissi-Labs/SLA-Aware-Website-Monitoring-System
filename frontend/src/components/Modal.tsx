import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  title: string
  description?: string
  onClose: () => void
  /** Blocks Escape / backdrop / X dismissal while a request is in flight. */
  closeDisabled?: boolean
  maxWidth?: 'sm' | 'md'
  children: ReactNode
}

/** Shared dialog chrome: dimmed backdrop, card, title row with close button. */
export default function Modal({ title, description, onClose, closeDisabled = false, maxWidth = 'md', children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !closeDisabled && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, closeDisabled])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px] animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && !closeDisabled && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card w-full ${maxWidth === 'sm' ? 'max-w-sm' : 'max-w-lg'} animate-pop overflow-hidden shadow-overlay`}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-txt-hi">{title}</h2>
            {description && <p className="mt-1 text-[13px] leading-relaxed text-txt-mid">{description}</p>}
          </div>
          <button onClick={onClose} disabled={closeDisabled} aria-label="Close" className="icon-btn -mr-1 -mt-1">
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

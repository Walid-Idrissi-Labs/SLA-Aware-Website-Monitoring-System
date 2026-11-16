import type { ReactNode } from 'react'
import Logo from './Logo'

interface Props {
  /** Optional eyebrow above the title. */
  kicker?: string
  title: string
  subtitle?: string
  children: ReactNode
  /** Small line under the card, e.g. a link to the other auth page. */
  footer?: ReactNode
}

/**
 * Shared full-screen frame for the auth pages (Login / Signup / Confirm).
 * Uses the same plain page background as the app — no ambient blur, no wordmark
 * — so signing in looks like the product rather than a landing page.
 */
export default function AuthLayout({ kicker, title, subtitle, children, footer }: Props) {
  return (
    <div className="grid h-full place-items-center overflow-y-auto overflow-x-hidden px-6 py-12">
      <div className="w-full max-w-[380px]">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="block" style={{ filter: 'drop-shadow(0 6px 20px rgba(250,92,41,0.35))' }}>
            <Logo size={44} className="block" />
          </span>
          <p className="text-[12.5px] text-txt-lo">SLA-aware website monitoring</p>
        </div>

        {/* Card */}
        <div className="panel rounded-[18px] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {kicker && <p className="text-[12px] font-medium text-accent">{kicker}</p>}
              <h2 className="mt-0.5 font-display text-[18px] font-semibold tracking-[-0.01em] text-txt-hi">
                {title}
              </h2>
            </div>
            <span className="flex-none text-[11px] text-txt-dim">Amazon Cognito</span>
          </div>
          {subtitle && <p className="mt-1.5 text-[12.5px] leading-relaxed text-txt-lo">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>

        {footer && <div className="mt-5 text-center text-[12px] text-txt-lo">{footer}</div>}
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import Logo from './Logo'

interface Props {
  kicker: string
  title: string
  subtitle?: string
  children: ReactNode
  /** Small line under the card, e.g. a link to the other auth page. */
  footer?: ReactNode
}

/**
 * Shared full-screen frame for the auth pages (Login / Signup / Confirm).
 * Mirrors the app's BootSplash aesthetic: ambient accent glow, brand mark,
 * and a frosted `.panel` card — so the login feels like part of the app.
 */
export default function AuthLayout({ kicker, title, subtitle, children, footer }: Props) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-6 py-12">
      {/* ambient glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[440px] w-[560px] -translate-x-1/2 rounded-full bg-accent/10 blur-[120px]" />

      <div className="relative w-full max-w-sm animate-fade-up">
        {/* Brand */}
        <div className="flex flex-col items-center">
          <span className="relative" style={{ filter: 'drop-shadow(0 0 22px rgba(250,92,41,0.45))' }}>
            <Logo size={44} className="block" />
            <span className="absolute -inset-2 rounded-2xl border border-accent/20" />
          </span>
          <h1 className="mt-5 font-display text-[19px] font-bold tracking-tight text-txt-hi">
            SLA<span className="text-accent">://</span>MONITOR
          </h1>
        </div>

        {/* Card */}
        <div className="panel frame-corners mt-6 p-6">
          <div className="relative flex items-center justify-between mb-6 gap-3">
            <p className="kicker">{kicker}</p>

            <span className="font-mono text-[10px] uppercase tracking-micro  text-txt-dim">
              Secured by Amazon Cognito
            </span>
          </div>
          <h2 className="mt-1 font-display text-[18px] font-semibold text-txt-hi">{title}</h2>
          {subtitle && <p className="mt-1 text-[12px] leading-relaxed text-txt-lo">{subtitle}</p>}
          <div className="hr-accent mt-4" />
          <div className="mt-5">{children}</div>
        </div>

        {footer && <div className="mt-5 text-center text-[12px] text-txt-lo">{footer}</div>}
      </div>
    </div>
  )
}

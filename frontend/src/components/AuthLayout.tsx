import type { ReactNode } from 'react'
import Logo from './Logo'

interface Props {
  title: string
  subtitle?: string
  children: ReactNode
  /** Small line under the card, e.g. a link to the other auth page. */
  footer?: ReactNode
}

/** Shared full-screen frame for the auth pages (Login / Signup / Confirm). */
export default function AuthLayout({ title, subtitle, children, footer }: Props) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-[380px] animate-fade-up">
        <div className="flex flex-col items-center text-center">
          <Logo size={36} className="block rounded-lg" />
          <h1 className="mt-5 text-[18px] font-semibold tracking-[-0.01em] text-txt-hi">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-txt-mid">{subtitle}</p>}
        </div>

        <div className="card mt-7 p-6">{children}</div>

        {footer && <p className="mt-5 text-center text-[13px] text-txt-mid">{footer}</p>}
      </div>
    </div>
  )
}

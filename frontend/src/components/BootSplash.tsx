import type { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  title: string
  lines: string[]
}

/** Full-screen branded boot / auth handoff splash. */
export default function BootSplash({ icon, title, lines }: Props) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-6">
      {/* ambient glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[100px]" />

      <div className="relative w-full max-w-sm animate-fade-up">
        {/* Logo with pulse rings */}
        <div className="mx-auto grid h-16 w-16 place-items-center">
          <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-accent-sheen shadow-glow-accent">
            {icon}
            <span className="absolute inset-0 rounded-2xl border border-accent/40 animate-pulse-ring" />
          </span>
        </div>

        {/* Wordmark */}
        <h1 className="mt-6 text-center font-display text-[20px] font-bold tracking-tight text-txt-hi">
          SLA<span className="text-accent">://</span>MONITOR
        </h1>
        <p className="mt-1.5 text-center font-mono text-[11px] uppercase tracking-micro text-txt-lo">{title}</p>

        {/* Shimmer progress */}
        <div className="mx-auto mt-6 h-1 w-48 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full w-1/2 rounded-full bg-accent-sheen animate-marquee" style={{ animationDuration: '1.4s' }} />
        </div>

        {/* Terminal status lines */}
        <div className="mx-auto mt-6 w-fit space-y-1.5">
          {lines.map((line, i) => (
            <div
              key={line}
              className="flex items-center gap-2 font-mono text-[10px] text-txt-lo animate-fade-in"
              style={{ animationDelay: `${300 + i * 350}ms`, opacity: 0, animationFillMode: 'forwards' }}
            >
              <span className="led led-accent" />
              {line}
              <span className="text-accent">›</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

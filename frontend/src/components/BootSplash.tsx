import Logo from './Logo'

interface Props {
  title: string
}

/** Full-screen branded boot / auth handoff splash. */
export default function BootSplash({ title }: Props) {
  return (
    <div className="grid h-full place-items-center overflow-y-auto overflow-x-hidden px-6">
      <div className="w-full max-w-sm">
        <div className="mx-auto grid h-16 w-16 place-items-center">
          <span className="relative" style={{ filter: 'drop-shadow(0 0 22px rgba(250,92,41,0.4))' }}>
            <Logo size={52} className="block" />
            <span className="absolute -inset-2 rounded-2xl border border-accent/20" />
          </span>
        </div>

        <p className="mt-6 text-center text-[13px] text-txt-lo">{title}</p>

        {/* Indeterminate progress */}
        <div className="mx-auto mt-5 h-1 w-48 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full w-1/3 rounded-full bg-accent-sheen animate-indeterminate" />
        </div>
      </div>
    </div>
  )
}

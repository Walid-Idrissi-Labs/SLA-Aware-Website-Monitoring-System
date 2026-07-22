import Logo from './Logo'
import { Spinner } from './ui'

interface Props {
  title: string
}

/** Full-screen branded boot / auth handoff splash. */
export default function BootSplash({ title }: Props) {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="flex flex-col items-center animate-fade-up">
        <Logo size={36} className="block rounded-lg" />
        <div className="mt-6 flex items-center gap-2.5 text-txt-mid">
          <Spinner size={15} />
          <span className="text-[13px]">{title}…</span>
        </div>
      </div>
    </div>
  )
}

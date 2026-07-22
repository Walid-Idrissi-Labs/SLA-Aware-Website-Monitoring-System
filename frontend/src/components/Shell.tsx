import type { ReactNode } from 'react'
import TopNav from './TopNav'

interface Props {
  children: ReactNode
}

/** App frame: top navigation bar over a centered content column. */
export default function Shell({ children }: Props) {
  return (
    <div className="flex min-h-screen flex-col text-txt-hi">
      <TopNav />
      <main className="flex-1 px-4 py-8 sm:px-6">
        <div className="mx-auto w-full max-w-[1200px]">{children}</div>
      </main>
    </div>
  )
}

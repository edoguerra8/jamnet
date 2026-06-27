'use client'
import { useRouter } from 'next/navigation'
import CompassIcon from '@/components/CompassIcon'

// A single discovery line, in line with JamNet's mission (PROGETTO.md §1):
// the vinyl idiom "drop the needle" + the whole world it reaches into.
const DISCOVERY_LINE = 'Drop the needle anywhere in the world.'

export default function Home() {
  const router = useRouter()

  const enter = () => router.push('/flow')

  return (
    <main className="min-h-dvh flex flex-col items-center px-6 pt-safe pb-safe">
      {/* Top bar */}
      <div className="w-full max-w-md flex justify-between items-center pt-6">
        <span className="font-serif text-lg tracking-tight">JamNet</span>
        <button
          onClick={() => router.push('/library')}
          className="opacity-40 hover:opacity-100 transition-opacity duration-200"
          aria-label="Library"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 19V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13" strokeLinecap="round" />
            <path d="M4 19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2" />
            <line x1="9" y1="8" x2="15" y2="8" strokeLinecap="round" />
            <line x1="9" y1="12" x2="13" y2="12" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* The compass-vinyl IS the entry point — tap to begin the flow */}
      <div className="w-full max-w-md flex-1 flex flex-col items-center justify-center gap-10">
        <button
          onClick={enter}
          aria-label="Begin discovering"
          className="group flex items-center justify-center text-ink active:scale-[0.98] transition-transform duration-200"
        >
          <CompassIcon
            idle
            size={260}
            className="text-ink/90 group-hover:text-ink transition-colors duration-300"
          />
        </button>

        <p className="font-serif text-xl text-center text-ink/85 leading-snug max-w-[18rem]">
          {DISCOVERY_LINE}
        </p>
      </div>
    </main>
  )
}

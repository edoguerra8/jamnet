'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import WorldMap from '@/components/map/WorldMap'
import DecadeButtons from '@/components/controls/DecadeButtons'
import CompassIcon from '@/components/ui/CompassIcon'
import { getDailyDestination, dailyLabel, dailyBearing } from '@/lib/daily'

function PlayTriangle({ size = 15, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" className={className}>
      <path d="M4 2.5l9.5 5.5L4 13.5V2.5z" />
    </svg>
  )
}

export default function HomeScreen() {
  const router = useRouter()
  // Empty selections mean "whole world" / "all decades" (defaults, sez. 4.2)
  const [areas, setAreas] = useState<string[]>([])
  const [decades, setDecades] = useState<number[]>([])
  const [now, setNow] = useState(false)

  const daily = getDailyDestination()

  const toggleArea = (area: string) => {
    setAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area])
  }

  const hasSelection = areas.length > 0 || decades.length > 0 || now

  const play = () => {
    const p = new URLSearchParams()
    if (areas.length > 0) p.set('areas', areas.join(','))
    const dec = [...decades.map(String), ...(now ? ['now'] : [])]
    if (dec.length > 0) p.set('decades', dec.join(','))
    const str = p.toString()
    router.push(`/flow${str ? `?${str}` : ''}`)
  }

  const playDaily = () => {
    const p = new URLSearchParams()
    p.set('country', daily.country)
    p.set('decades', String(daily.decade))
    router.push(`/flow?${p.toString()}`)
  }

  return (
    <main className="min-h-dvh flex flex-col bg-sand text-ink px-6 pt-safe pb-safe">
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col pt-14 pb-2">

        {/* Top bar */}
        <div className="flex justify-between items-center mb-[22px]">
          <span className="font-serif text-[18px]">JamNet</span>
          <button
            onClick={() => router.push('/library')}
            className="text-ink/40 hover:text-ink transition-colors duration-200"
            aria-label="Library"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 19V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13" strokeLinecap="round" />
              <path d="M4 19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2" />
              <line x1="9" y1="8" x2="15" y2="8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Daily — play-first hero */}
        <button
          onClick={playDaily}
          className="flex items-center gap-[14px] rounded-[14px] border border-border bg-surface p-4 mb-[26px] text-left active:scale-[0.99] transition-transform duration-200"
        >
          <CompassIcon minimal size={40} bearing={dailyBearing(daily)} className="text-ink shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-sans uppercase tracking-[2.2px] text-muted mb-1">
              Today the compass points to
            </div>
            <div className="font-serif text-[20px] leading-[1.1] truncate">{dailyLabel(daily)}</div>
          </div>
          <span className="w-[42px] h-[42px] shrink-0 rounded-full bg-pine text-sand flex items-center justify-center shadow-[0_2px_8px_rgba(63,107,78,0.22)]">
            <PlayTriangle />
          </span>
        </button>

        {/* OR steer your own */}
        <div className="flex items-center gap-[10px] mb-[14px]">
          <span className="text-[10px] font-sans uppercase tracking-[2px] text-muted">Or steer your own</span>
          <span className="flex-1 h-px bg-border" />
        </div>

        {/* Map */}
        <div className="rounded-[12px] border border-border bg-surface px-[6px] py-2 mb-3">
          <WorldMap selected={areas} onToggle={toggleArea} className="w-full block" />
        </div>
        <div className="flex justify-center mb-5">
          <button
            onClick={() => setAreas([])}
            aria-pressed={areas.length === 0}
            className={`px-4 py-1.5 rounded-full text-[12px] font-sans font-medium transition-colors duration-200 ${
              areas.length === 0
                ? 'bg-pine text-sand'
                : 'border border-border text-muted'
            }`}
          >
            Whole world
          </button>
        </div>

        {/* Decades — righello */}
        <div className="mb-auto">
          <DecadeButtons
            selected={decades}
            now={now}
            onChange={(d, n) => { setDecades(d); setNow(n) }}
          />
        </div>

        {/* Universal play */}
        <button
          onClick={play}
          className="w-full rounded-[14px] bg-pine text-sand py-4 mt-6 text-[15px] font-sans font-medium flex items-center justify-center gap-[9px] shadow-[0_2px_12px_rgba(63,107,78,0.22)] active:scale-[0.98] transition-transform duration-200"
        >
          <PlayTriangle />
          {hasSelection ? 'Play selection' : 'Play the whole world'}
        </button>

      </div>
    </main>
  )
}

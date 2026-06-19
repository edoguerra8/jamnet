'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import WorldMap from '@/components/map/WorldMap'
import DecadeButtons, { DECADES } from '@/components/controls/DecadeButtons'
import ModeSelector from '@/components/controls/ModeSelector'
import { FlowMode } from '@/lib/types'
import { getDailyDestination, dailyLabel } from '@/lib/daily'

export default function HomeScreen() {
  const router = useRouter()
  // Empty selections mean "whole world" / "all decades" (defaults, sez. 4.2)
  const [areas, setAreas] = useState<string[]>([])
  const [decades, setDecades] = useState<number[]>([])
  const [mode, setMode] = useState<FlowMode>('course')

  const daily = getDailyDestination()

  const toggleArea = (area: string) => {
    setAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area])
  }

  const toggleDecade = (d: number) => {
    setDecades(prev => {
      if (prev.length === 0) return [d]            // from "all" to just this one
      const next = prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
      return next.length === 0 || next.length === DECADES.length ? [] : next
    })
  }

  const play = () => {
    const p = new URLSearchParams()
    if (areas.length > 0) p.set('areas', areas.join(','))
    if (decades.length > 0) p.set('decades', decades.join(','))
    if (mode !== 'course') p.set('mode', mode)
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

      <div className="w-full max-w-md flex-1 flex flex-col justify-center gap-8 py-8">
        {/* World map — the central element */}
        <div className="flex flex-col gap-3">
          <WorldMap selected={areas} onToggle={toggleArea} className="w-full" />
          <div className="flex justify-center">
            <button
              onClick={() => setAreas([])}
              aria-pressed={areas.length === 0}
              className={`px-4 py-1.5 rounded-full text-[13px] font-sans border transition-colors duration-200 ${
                areas.length === 0
                  ? 'bg-terracotta border-terracotta text-ivory'
                  : 'border-border text-muted'
              }`}
            >
              Whole world
            </button>
          </div>
        </div>

        {/* Decades */}
        <DecadeButtons selected={decades} onToggle={toggleDecade} />

        {/* Mode */}
        <ModeSelector mode={mode} onChange={setMode} />

        {/* Daily destination + play */}
        <div className="flex flex-col items-center gap-5 pt-2">
          <button
            onClick={playDaily}
            className="text-[13px] font-sans text-muted hover:text-terracotta transition-colors duration-200"
          >
            Today the compass points to{' '}
            <span className="text-ink font-serif">{dailyLabel(daily)}</span>
          </button>

          <button
            onClick={play}
            aria-label="Play"
            className="w-20 h-20 flex items-center justify-center rounded-full bg-terracotta text-ivory hover:opacity-90 active:scale-95 transition-all duration-200"
          >
            <svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor">
              <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
            </svg>
          </button>
        </div>
      </div>
    </main>
  )
}

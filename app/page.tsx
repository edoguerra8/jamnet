'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import RangeSlider from '@/components/RangeSlider'

const AREAS = [
  'All', 'West Africa', 'North Africa', 'Middle East',
  'South Asia', 'East Asia', 'Southeast Asia',
  'Latin America', 'Caribbean', 'Europe', 'North America', 'Oceania',
]

const MIN_YEAR = 1950
const MAX_YEAR = 2026

export default function Home() {
  const router = useRouter()
  const [selectedAreas, setSelectedAreas] = useState<string[]>(['All'])
  const [yearFrom, setYearFrom] = useState(MIN_YEAR)
  const [yearTo, setYearTo] = useState(MAX_YEAR)

  const toggleArea = (area: string) => {
    if (area === 'All') {
      setSelectedAreas(['All'])
      return
    }
    setSelectedAreas(prev => {
      const withoutAll = prev.filter(a => a !== 'All')
      if (withoutAll.includes(area)) {
        const next = withoutAll.filter(a => a !== area)
        return next.length === 0 ? ['All'] : next
      }
      return [...withoutAll, area]
    })
  }

  const play = () => {
    const p = new URLSearchParams()
    if (!selectedAreas.includes('All')) p.set('areas', selectedAreas.join(','))
    if (yearFrom !== MIN_YEAR) p.set('yearFrom', String(yearFrom))
    if (yearTo !== MAX_YEAR) p.set('yearTo', String(yearTo))
    const str = p.toString()
    router.push(`/flow${str ? `?${str}` : ''}`)
  }

  const isAllYears = yearFrom === MIN_YEAR && yearTo === MAX_YEAR

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 pt-safe pb-safe">
      {/* Wordmark */}
      <div className="absolute top-6 left-6 pt-safe">
        <span className="font-serif text-lg tracking-tight opacity-90">JamNet</span>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-10">
        {/* Geographic area chips */}
        <div className="flex flex-col gap-3">
          <span className="text-[11px] font-sans text-muted uppercase tracking-widest">Area</span>
          <div className="flex flex-wrap gap-2">
            {AREAS.map(area => (
              <button
                key={area}
                onClick={() => toggleArea(area)}
                className={`px-3 py-1.5 rounded-full text-[13px] font-sans border transition-all ${
                  selectedAreas.includes(area)
                    ? 'bg-terracotta border-terracotta text-ivory'
                    : 'border-ink/20 dark:border-ivory/20 text-muted hover:border-terracotta hover:text-terracotta'
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        </div>

        {/* Year range */}
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-sans text-muted uppercase tracking-widest">Period</span>
            <span className="text-sm font-sans text-muted tabular-nums">
              {isAllYears ? 'All years' : `${yearFrom} – ${yearTo}`}
            </span>
          </div>
          <RangeSlider
            min={MIN_YEAR} max={MAX_YEAR}
            from={yearFrom} to={yearTo}
            onChange={(f, t) => { setYearFrom(f); setYearTo(t) }}
          />
        </div>

        {/* Play button */}
        <div className="flex justify-center pt-2">
          <button
            onClick={play}
            aria-label="Play"
            className="w-16 h-16 flex items-center justify-center rounded-full bg-terracotta text-ivory hover:opacity-90 active:scale-95 transition-all shadow"
          >
            <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor">
              <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
            </svg>
          </button>
        </div>
      </div>
    </main>
  )
}

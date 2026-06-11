'use client'

// Decade buttons 1950s → 2020s, multi-select (sez. 4.2).
// `selected` empty = all decades (default).

export const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]

interface Props {
  selected: number[]
  onToggle: (decade: number) => void
}

export default function DecadeButtons({ selected, onToggle }: Props) {
  const allActive = selected.length === 0
  return (
    <div className="grid grid-cols-4 gap-2">
      {DECADES.map(d => {
        const active = allActive || selected.includes(d)
        const highlighted = !allActive && selected.includes(d)
        return (
          <button
            key={d}
            onClick={() => onToggle(d)}
            aria-pressed={active}
            className={`py-2 rounded-lg text-[13px] font-sans border transition-colors duration-200 tabular-nums ${
              highlighted
                ? 'border-terracotta text-terracotta'
                : allActive
                  ? 'border-border text-ink/70'
                  : 'border-border text-muted/60'
            }`}
          >
            {d}s
          </button>
        )
      })}
    </div>
  )
}

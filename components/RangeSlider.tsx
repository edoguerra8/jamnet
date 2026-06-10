'use client'

interface Props {
  min: number
  max: number
  from: number
  to: number
  onChange: (from: number, to: number) => void
}

export default function RangeSlider({ min, max, from, to, onChange }: Props) {
  const fromPct = ((from - min) / (max - min)) * 100
  const toPct = ((to - min) / (max - min)) * 100

  return (
    <div className="relative h-6 flex items-center select-none">
      {/* Background track */}
      <div className="absolute inset-x-0 h-[2px] bg-ink/10 dark:bg-ivory/10 rounded-full" />
      {/* Active fill */}
      <div
        className="absolute h-[2px] bg-terracotta rounded-full pointer-events-none"
        style={{ left: `${fromPct}%`, right: `${100 - toPct}%` }}
      />
      {/* From: transparent range input */}
      <input
        type="range"
        min={min}
        max={max}
        value={from}
        onChange={e => onChange(Math.min(Number(e.target.value), to - 1), to)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        style={{ zIndex: from > max - (max - min) * 0.1 ? 5 : 3 }}
      />
      {/* To: transparent range input */}
      <input
        type="range"
        min={min}
        max={max}
        value={to}
        onChange={e => onChange(from, Math.max(Number(e.target.value), from + 1))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        style={{ zIndex: 4 }}
      />
      {/* Visual thumb: from */}
      <div
        className="absolute w-[18px] h-[18px] rounded-full bg-terracotta border-2 border-ivory dark:border-dark-bg shadow-sm pointer-events-none"
        style={{ left: `${fromPct}%`, transform: 'translateX(-50%)' }}
      />
      {/* Visual thumb: to */}
      <div
        className="absolute w-[18px] h-[18px] rounded-full bg-terracotta border-2 border-ivory dark:border-dark-bg shadow-sm pointer-events-none"
        style={{ left: `${toPct}%`, transform: 'translateX(-50%)' }}
      />
    </div>
  )
}

'use client'
import { FlowMode } from '@/lib/types'

// Rotta / Vortice selector (sez. 4.2) — UI copy in English: Course / Whirl.
// Course: the needle holds a direction. Whirl: it spins free.

interface Props {
  mode: FlowMode
  onChange: (mode: FlowMode) => void
}

function NeedleGlyph({ tilted }: { tilted?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <g transform={tilted ? 'rotate(124 8 8)' : undefined}>
        <line x1="8" y1="3.4" x2="8" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="8" y1="8" x2="8" y2="12.6" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.4" />
      </g>
      <circle cx="8" cy="8" r="1.1" fill="currentColor" />
    </svg>
  )
}

export default function ModeSelector({ mode, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Flow mode" className="flex rounded-lg border border-border p-0.5">
      {([
        { value: 'course' as FlowMode, label: 'Course', tilted: false },
        { value: 'whirl' as FlowMode, label: 'Whirl', tilted: true },
      ]).map(opt => {
        const active = mode === opt.value
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-[13px] font-sans transition-colors duration-200 ${
              active ? 'bg-parchment text-ink' : 'text-muted'
            }`}
          >
            <span className={active ? 'text-terracotta' : ''}>
              <NeedleGlyph tilted={opt.tilted} />
            </span>
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

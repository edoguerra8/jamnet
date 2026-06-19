'use client'
import { useRef } from 'react'

function fmt(s: number): string {
  if (!isFinite(s) || s <= 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

interface Props {
  position: number
  duration: number
  onSeek: (seconds: number) => void
  disabled?: boolean
}

// Draggable progress bar with elapsed / total time.
export default function SeekBar({ position, duration, onSeek, disabled = false }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const pct = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0

  const seekAt = (clientX: number) => {
    const el = ref.current
    if (!el || duration <= 0) return
    const r = el.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    onSeek(f * duration)
  }

  return (
    <div>
      <div
        ref={ref}
        onPointerDown={(e) => { if (disabled) return; try { e.currentTarget.setPointerCapture(e.pointerId) } catch {} ; seekAt(e.clientX) }}
        onPointerMove={(e) => { if (disabled || e.buttons === 0) return; seekAt(e.clientX) }}
        className={`relative h-3 flex items-center touch-none ${disabled ? 'opacity-40' : 'cursor-pointer'}`}
      >
        <div className="absolute left-0 right-0 h-[3px] rounded-full bg-[#D8D2C4]" />
        <div className="absolute left-0 h-[3px] rounded-full bg-pine" style={{ width: `${pct * 100}%` }} />
        <div
          className="absolute w-[11px] h-[11px] rounded-full bg-pine shadow-[0_1px_3px_rgba(32,35,30,0.2)] -translate-x-1/2"
          style={{ left: `${pct * 100}%` }}
        />
      </div>
      <div className="flex justify-between mt-2 text-[11px] font-sans text-muted tabular-nums">
        <span>{fmt(position)}</span>
        <span>{fmt(duration)}</span>
      </div>
    </div>
  )
}

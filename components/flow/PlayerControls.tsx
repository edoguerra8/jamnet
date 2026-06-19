'use client'
import { useRef } from 'react'
import HeartButton, { SaveState } from '@/components/ui/HeartButton'

const HOLD_MS = 280  // press longer than this → continuous scan; shorter → single skip

interface Props {
  isPlaying: boolean
  onTogglePlay: () => void
  /** change track */
  onPrevTrack: () => void
  onNextTrack: () => void
  /** seek WITHIN the current track: tap = small skip, hold = continuous scan */
  onScanTap: (dir: 1 | -1) => void
  onScanStart: (dir: 1 | -1) => void
  onScanStop: () => void
  /** utility row */
  saveState: SaveState
  onSaveToGenre: () => void
  onSaveToCompilation: () => void
  onShare: () => void
  onReport: () => void
  reportSent: boolean
}

// Press-and-hold for the ⏪ / ⏩ scan buttons: a tap skips a few seconds, a hold
// scans continuously; the trailing click after a hold is suppressed.
function useScan(
  dir: 1 | -1,
  onScanTap: (d: 1 | -1) => void,
  onScanStart: (d: 1 | -1) => void,
  onScanStop: () => void,
) {
  const timer = useRef<number | null>(null)
  const scanning = useRef(false)
  const suppressClick = useRef(false)

  const end = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (scanning.current) { onScanStop(); scanning.current = false }
  }

  return {
    onPointerDown: (e: React.PointerEvent) => {
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
      scanning.current = false
      timer.current = window.setTimeout(() => {
        scanning.current = true
        suppressClick.current = true
        onScanStart(dir)
      }, HOLD_MS)
    },
    onPointerUp: end,
    onPointerCancel: end,
    onClick: () => {
      if (suppressClick.current) { suppressClick.current = false; return }
      onScanTap(dir)
    },
  }
}

export default function PlayerControls({
  isPlaying, onTogglePlay, onPrevTrack, onNextTrack, onScanTap, onScanStart, onScanStop,
  saveState, onSaveToGenre, onSaveToCompilation, onShare, onReport, reportSent,
}: Props) {
  const rew = useScan(-1, onScanTap, onScanStart, onScanStop)
  const fwd = useScan(1, onScanTap, onScanStart, onScanStop)

  return (
    <div className="w-full max-w-[280px] mx-auto flex flex-col gap-[18px] select-none">
      {/* Transport */}
      <div className="flex items-center justify-between">
        <button onClick={onPrevTrack} className="p-1.5 opacity-55 hover:opacity-100 transition-opacity duration-200" aria-label="Previous track">
          <svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor">
            <path d="M18 4.5L8 12l10 7.5V4.5z" /><rect x="5" y="4.5" width="2.1" height="15" rx="1" />
          </svg>
        </button>

        <button {...rew} className="p-1.5 opacity-70 hover:opacity-100 transition-opacity duration-200 touch-none" aria-label="Rewind (hold to scan)">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M12.5 5L4.5 12l8 7V5z" /><path d="M21 5l-8 7 8 7V5z" />
          </svg>
        </button>

        <button
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="w-14 h-14 flex items-center justify-center rounded-full bg-pine text-sand shadow-[0_2px_12px_rgba(63,107,78,0.28)] hover:opacity-90 active:scale-95 transition-all duration-200"
        >
          {isPlaying ? (
            <svg viewBox="0 0 16 16" width="19" height="19" fill="currentColor"><rect x="3.4" y="2.5" width="3.3" height="11" rx="1" /><rect x="9.3" y="2.5" width="3.3" height="11" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 16 16" width="19" height="19" fill="currentColor"><path d="M4 2.5l9.5 5.5L4 13.5V2.5z" /></svg>
          )}
        </button>

        <button {...fwd} className="p-1.5 opacity-70 hover:opacity-100 transition-opacity duration-200 touch-none" aria-label="Fast-forward (hold to scan)">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M11.5 5l8 7-8 7V5z" /><path d="M3 5l8 7-8 7V5z" />
          </svg>
        </button>

        <button onClick={onNextTrack} className="p-1.5 opacity-55 hover:opacity-100 transition-opacity duration-200" aria-label="Next track">
          <svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor">
            <path d="M6 4.5l10 7.5-10 7.5V4.5z" /><rect x="16.9" y="4.5" width="2.1" height="15" rx="1" />
          </svg>
        </button>
      </div>

      {/* Utility: save · share · report */}
      <div className="flex items-center justify-center gap-[34px] pt-0.5">
        <HeartButton saveState={saveState} onSaveToGenre={onSaveToGenre} onSaveToCompilation={onSaveToCompilation} size={21} />
        <button onClick={onShare} className="p-1 opacity-45 hover:opacity-100 transition-opacity duration-200" aria-label="Share this track">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" strokeLinecap="round" />
            <path d="M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          onClick={() => { if (!reportSent) onReport() }}
          className={`p-1 transition-opacity duration-200 ${reportSent ? 'opacity-20 pointer-events-none' : 'opacity-35 hover:opacity-70'}`}
          aria-label="Report wrong match"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinejoin="round" />
            <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
            <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

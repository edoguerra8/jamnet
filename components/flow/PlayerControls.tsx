'use client'
import { useRef } from 'react'
import HeartButton, { SaveState } from '@/components/ui/HeartButton'

const HOLD_MS = 300  // press longer than this → fast-scrub; shorter → single step

interface Props {
  isPlaying: boolean
  saveState: SaveState
  onSaveToGenre: () => void
  onSaveToCompilation: () => void
  onShare: () => void
  onTogglePlay: () => void
  /** single track step: -1 = previous, +1 = next */
  onStep: (dir: 1 | -1) => void
  /** start fast-scrubbing in a direction (hold) */
  onScrubStart: (dir: 1 | -1) => void
  /** stop fast-scrubbing and land on the current track */
  onScrubStop: () => void
  onReport: () => void
  reportSent: boolean
}

// Encapsulates the press-and-hold gesture for one direction button.
// A short press → onClick fires a single step. A long press → fast-scrub; the
// trailing click is then suppressed. Using onClick for the tap keeps it working
// for mouse, touch and assistive tech alike; pointer events only detect the hold.
function useHold(
  dir: 1 | -1,
  onStep: (d: 1 | -1) => void,
  onScrubStart: (d: 1 | -1) => void,
  onScrubStop: () => void,
) {
  const holdTimer    = useRef<number | null>(null)
  const scrubbing    = useRef(false)
  const suppressClick = useRef(false)

  const clear = () => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
  }

  const endHold = () => {
    clear()
    if (scrubbing.current) { onScrubStop(); scrubbing.current = false }
  }

  return {
    onPointerDown: (e: React.PointerEvent) => {
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
      scrubbing.current = false
      holdTimer.current = window.setTimeout(() => {
        scrubbing.current = true
        suppressClick.current = true
        onScrubStart(dir)
      }, HOLD_MS)
    },
    onPointerUp: endHold,
    onPointerCancel: endHold,
    onClick: () => {
      if (suppressClick.current) { suppressClick.current = false; return }
      onStep(dir)
    },
  }
}

export default function PlayerControls({
  isPlaying, saveState, onSaveToGenre, onSaveToCompilation,
  onShare, onTogglePlay, onStep, onScrubStart, onScrubStop, onReport, reportSent,
}: Props) {
  const prevHold = useHold(-1, onStep, onScrubStart, onScrubStop)
  const nextHold = useHold(1, onStep, onScrubStart, onScrubStop)

  return (
    <div className="w-full max-w-xs flex items-center justify-between pt-4 select-none">
      <HeartButton
        saveState={saveState}
        onSaveToGenre={onSaveToGenre}
        onSaveToCompilation={onSaveToCompilation}
        size={24}
      />

      <button onClick={onShare} className="p-2 -m-2 opacity-40 hover:opacity-100 transition-opacity duration-200" aria-label="Share this track">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" strokeLinecap="round" />
          <path d="M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Transport cluster: hold prev/next to fast-scrub, tap to step one track */}
      <div className="flex items-center gap-3">
        <button
          {...prevHold}
          className="p-2 -m-1 opacity-50 hover:opacity-100 transition-opacity duration-200 touch-none"
          aria-label="Previous track (hold to rewind)"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M19 4.5L9 12l10 7.5V4.5z" />
            <rect x="5" y="4.5" width="2" height="15" rx="1" />
          </svg>
        </button>

        <button
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="w-14 h-14 flex items-center justify-center rounded-full bg-pine text-sand shadow-[0_2px_12px_rgba(63,107,78,0.28)] hover:opacity-90 active:scale-95 transition-all duration-200"
        >
          {isPlaying ? (
            <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
              <rect x="3" y="2.5" width="3.4" height="11" rx="1" />
              <rect x="9.6" y="2.5" width="3.4" height="11" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
              <path d="M4 2.5l9.5 5.5L4 13.5V2.5z" />
            </svg>
          )}
        </button>

        <button
          {...nextHold}
          className="p-2 -m-1 opacity-50 hover:opacity-100 transition-opacity duration-200 touch-none"
          aria-label="Next track (hold to fast-forward)"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M5 4.5l10 7.5-10 7.5V4.5z" />
            <rect x="17" y="4.5" width="2" height="15" rx="1" />
          </svg>
        </button>
      </div>

      <button
        onClick={() => { if (!reportSent) onReport() }}
        className={`p-2 -m-2 transition-opacity duration-200 ${reportSent ? 'opacity-20 pointer-events-none' : 'opacity-30 hover:opacity-70'}`}
        aria-label="Report wrong match"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinejoin="round" />
          <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
          <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

'use client'
import { motion } from 'framer-motion'

interface Props {
  /** Continuous full rotation — Whirl while searching, or generic loading */
  spinning?: boolean
  /** Change this key to make the needle swing once and settle — Course on direction change */
  nudge?: number | string
  /** Slow, continuous idle rotation — the turntable at rest, used on the landing hero */
  idle?: boolean
  size?: number
  className?: string
}

// Vinyl grooves only read at larger sizes; small loaders (≤ this) stay clean.
const VINYL_THRESHOLD = 96

export default function CompassIcon({
  spinning = false,
  nudge,
  idle = false,
  size = 24,
  className = '',
}: Props) {
  const vinyl = size >= VINYL_THRESHOLD

  // The disc (grooves + label) is its own rotating body so it can spin like a
  // record. The needle sits above it and either holds, swings, or spins with it.
  const discAnimate = spinning
    ? { rotate: 360 }
    : idle
      ? { rotate: 360 }
      : { rotate: 0 }
  const discTransition = spinning
    ? { duration: 1.6, repeat: Infinity, ease: 'linear' as const }
    : idle
      ? { duration: 24, repeat: Infinity, ease: 'linear' as const }
      : { duration: 0.6, ease: 'easeInOut' as const }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
    >
      {/* ── Rotating disc body (vinyl) ───────────────────────────────────── */}
      <motion.g
        style={{ transformOrigin: '12px 12px' }}
        animate={discAnimate}
        transition={discTransition}
      >
        {/* Outer rim of the disc / compass ring — kept thin and warm, not a heavy hoop */}
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="0.55" opacity="0.7" />
        {vinyl && <circle cx="12" cy="12" r="9.1" stroke="currentColor" strokeWidth="0.3" opacity="0.3" />}

        {vinyl && (
          <>
            {/* Concentric grooves — the vinyl signature, drawn in warm ink */}
            <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="0.4" opacity="0.18" />
            <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="0.4" opacity="0.14" />
            <circle cx="12" cy="12" r="6.6" stroke="currentColor" strokeWidth="0.4" opacity="0.18" />
            <circle cx="12" cy="12" r="5.7" stroke="currentColor" strokeWidth="0.4" opacity="0.12" />
            <circle cx="12" cy="12" r="4.8" stroke="currentColor" strokeWidth="0.4" opacity="0.16" />
            {/* A single static sheen arc — the light catching the record */}
            <path
              d="M 6.2 6.2 A 8.2 8.2 0 0 1 12 3.8"
              stroke="currentColor"
              strokeWidth="0.5"
              strokeLinecap="round"
              opacity="0.1"
            />
            {/* Center label — terracotta disc, the record's heart */}
            <circle cx="12" cy="12" r="3.4" fill="#C96442" opacity="0.12" />
            <circle cx="12" cy="12" r="3.4" stroke="#C96442" strokeWidth="0.5" opacity="0.5" />
          </>
        )}

        {/* Cardinal ticks — keeps the compass reading on the disc rim */}
        <line x1="12" y1="3"   x2="12" y2="4.5" stroke="currentColor" strokeWidth="0.55" opacity="0.4" />
        <line x1="21" y1="12"  x2="19.5" y2="12" stroke="currentColor" strokeWidth="0.55" opacity="0.4" />
        <line x1="12" y1="21"  x2="12" y2="19.5" stroke="currentColor" strokeWidth="0.55" opacity="0.4" />
        <line x1="3"  y1="12"  x2="4.5" y2="12"  stroke="currentColor" strokeWidth="0.55" opacity="0.4" />
      </motion.g>

      {/* ── Needle / tonearm — holds direction (Course) or swings/settles ── */}
      <motion.g
        key={spinning ? 'spin' : `still-${nudge ?? 0}`}
        style={{ transformOrigin: '12px 12px' }}
        initial={{ rotate: 0 }}
        animate={spinning ? { rotate: 360 } : { rotate: [0, 26, -16, 8, -3, 0] }}
        transition={
          spinning
            ? { duration: 1.6, repeat: Infinity, ease: 'linear' }
            : { duration: 0.9, ease: 'easeInOut' }
        }
      >
        {/* North — slim terracotta needle, also reads as the tonearm */}
        <line x1="12" y1="4.3" x2="12" y2="12" stroke="#C96442" strokeWidth="1.25" strokeLinecap="round" />
        {/* Stylus head / cartridge at the needle's tip — the vinyl tell */}
        {vinyl && <circle cx="12" cy="4.3" r="0.8" fill="#C96442" />}
        {/* South — muted, shorter counterweight */}
        <line x1="12" y1="12" x2="12" y2="16.8" stroke="currentColor" strokeWidth="0.75" strokeLinecap="round" opacity="0.22" />
        {/* Pivot / spindle */}
        <circle cx="12" cy="12" r="1.35" fill="#C96442" />
        {/* Spindle hole highlight */}
        {vinyl && <circle cx="12" cy="12" r="0.5" fill="#FAF9F5" />}
      </motion.g>
    </svg>
  )
}

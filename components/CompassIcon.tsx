'use client'
import { motion } from 'framer-motion'

interface Props {
  /** Continuous full rotation — Vortice while searching, or generic loading */
  spinning?: boolean
  /** Change this key to make the needle swing once and settle — Rotta on direction change */
  nudge?: number | string
  size?: number
  className?: string
}

export default function CompassIcon({ spinning = false, nudge, size = 24, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
    >
      {/* Outer ring */}
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="0.75" />

      {/* Cardinal ticks */}
      <line x1="12" y1="3"   x2="12" y2="4.5" stroke="currentColor" strokeWidth="0.75" opacity="0.35" />
      <line x1="21" y1="12"  x2="19.5" y2="12" stroke="currentColor" strokeWidth="0.75" opacity="0.35" />
      <line x1="12" y1="21"  x2="12" y2="19.5" stroke="currentColor" strokeWidth="0.75" opacity="0.35" />
      <line x1="3"  y1="12"  x2="4.5" y2="12"  stroke="currentColor" strokeWidth="0.75" opacity="0.35" />

      {/* Needle */}
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
        {/* North — terracotta */}
        <line x1="12" y1="5"  x2="12" y2="12" stroke="#C96442" strokeWidth="1.75" strokeLinecap="round" />
        {/* South — muted */}
        <line x1="12" y1="12" x2="12" y2="19" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.28" />
        {/* Pivot */}
        <circle cx="12" cy="12" r="1.5" fill="#C96442" />
      </motion.g>
    </svg>
  )
}

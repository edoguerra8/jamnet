'use client'
import { motion } from 'framer-motion'

interface Props {
  spinning?: boolean
  size?: number
  className?: string
}

export default function CompassIcon({ spinning = false, size = 24, className = '' }: Props) {
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

      {/* Animated needle */}
      <motion.g
        style={{ transformOrigin: '12px 12px' }}
        animate={
          spinning
            ? { rotate: [0, 22, -14, 38, -8, 18, -10, 0] }
            : { rotate: 0 }
        }
        transition={
          spinning
            ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.65, ease: [0.34, 1.56, 0.64, 1] }
        }
      >
        {/* North — terracotta */}
        <line x1="12" y1="5"  x2="12" y2="12" stroke="#C4614A" strokeWidth="1.75" strokeLinecap="round" />
        {/* South — muted */}
        <line x1="12" y1="12" x2="12" y2="19" stroke="currentColor" strokeWidth="1"    strokeLinecap="round" opacity="0.28" />
        {/* Pivot */}
        <circle cx="12" cy="12" r="1.5" fill="#C4614A" />
      </motion.g>
    </svg>
  )
}

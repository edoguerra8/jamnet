'use client'
import { motion } from 'framer-motion'

interface Props {
  saved: boolean
  onToggle: () => void
  size?: number
}

export default function HeartButton({ saved, onToggle, size = 28 }: Props) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      aria-label={saved ? 'Remove from saved' : 'Save track'}
      className="flex items-center justify-center p-2 -m-2"
    >
      <motion.svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        whileTap={{ scale: 0.75 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      >
        <motion.path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill={saved ? '#C4614A' : 'none'}
          stroke={saved ? '#C4614A' : 'currentColor'}
          strokeWidth="1.5"
          strokeLinejoin="round"
          animate={saved ? { scale: [1, 1.28, 1] } : { scale: 1 }}
          style={{ transformOrigin: 'center' }}
          transition={{ duration: 0.3 }}
        />
      </motion.svg>
    </button>
  )
}

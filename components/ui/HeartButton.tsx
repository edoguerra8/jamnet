'use client'
import { motion, AnimatePresence } from 'framer-motion'

export type SaveState = 'none' | 'genre' | 'both'

interface Props {
  saveState: SaveState
  onSaveToGenre: () => void
  onSaveToCompilation: () => void
  size?: number
}

function haptic() {
  try { navigator.vibrate?.(12) } catch {}
}

export default function HeartButton({
  saveState, onSaveToGenre, onSaveToCompilation, size = 28,
}: Props) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (saveState === 'none') {
      haptic()
      onSaveToGenre()
    } else if (saveState === 'genre') {
      haptic()
      onSaveToCompilation()
    }
    // 'both' → already saved everywhere, no action
  }

  return (
    <button
      onClick={handleClick}
      aria-label={
        saveState === 'none' ? 'Save track' :
        saveState === 'genre' ? 'Add to compilation' :
        'Saved'
      }
      className="flex items-center justify-center p-2 -m-2"
    >
      <AnimatePresence mode="wait">
        {saveState === 'none' ? (
          // Empty heart
          <motion.svg
            key="heart-empty"
            viewBox="0 0 24 24" width={size} height={size}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            whileTap={{ scale: 0.72 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            <path
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </motion.svg>
        ) : saveState === 'genre' ? (
          // Bookmark outline — "add to compilation"
          <motion.svg
            key="bookmark-empty"
            viewBox="0 0 24 24" width={size} height={size}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [1.3, 1], opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            <path
              d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z"
              fill="none"
              stroke="#3F6B4E"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </motion.svg>
        ) : (
          // Bookmark filled — saved to both
          <motion.svg
            key="bookmark-filled"
            viewBox="0 0 24 24" width={size} height={size}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [1.3, 1], opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            <path
              d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z"
              fill="#3F6B4E"
              stroke="#3F6B4E"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </button>
  )
}

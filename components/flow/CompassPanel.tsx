'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CompassIcon from '@/components/ui/CompassIcon'
import WorldMap from '@/components/map/WorldMap'
import DecadeButtons from '@/components/controls/DecadeButtons'

interface Props {
  open: boolean
  initialAreas: string[]
  initialDecades: number[]
  initialNow: boolean
  fetching: boolean
  directionKey: string
  onClose: () => void
  onGo: (areas: string[], decades: number[], now: boolean) => void
  onHome: () => void
}

export default function CompassPanel({
  open, initialAreas, initialDecades, initialNow, fetching, directionKey, onClose, onGo, onHome,
}: Props) {
  const [areas, setAreas] = useState<string[]>(initialAreas)
  const [decades, setDecades] = useState<number[]>(initialDecades)
  const [now, setNow] = useState<boolean>(initialNow)

  // Re-sync the draft with the active filters each time the panel opens.
  useEffect(() => {
    if (open) {
      setAreas(initialAreas)
      setDecades(initialDecades)
      setNow(initialNow)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggleArea = (area: string) =>
    setAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative bg-sand rounded-t-2xl px-6 pt-7 pb-10 pb-safe max-h-[88dvh] overflow-y-auto"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-6 max-w-md mx-auto">
              <div className="flex items-center gap-3">
                <CompassIcon size={20} spinning={fetching} nudge={directionKey} className="text-ink" />
                <span className="text-sm font-sans text-muted">Set your bearings</span>
              </div>
              <div className="flex flex-col gap-2">
                <WorldMap selected={areas} onToggle={toggleArea} className="w-full" />
                <div className="flex justify-center">
                  <button
                    onClick={() => setAreas([])}
                    aria-pressed={areas.length === 0}
                    className={`px-4 py-1.5 rounded-full text-[13px] font-sans border transition-colors duration-200 ${
                      areas.length === 0 ? 'bg-pine border-pine text-sand' : 'border-border text-muted'
                    }`}
                  >
                    Whole world
                  </button>
                </div>
              </div>
              <DecadeButtons selected={decades} now={now} onChange={(d, n) => { setDecades(d); setNow(n) }} />
              <div className="flex justify-between items-center">
                <button onClick={onHome} className="text-sm font-sans text-muted hover:text-pine transition-colors duration-200">
                  Back to home
                </button>
                <button
                  onClick={() => onGo(areas, decades, now)}
                  className="px-6 py-2.5 bg-pine text-sand rounded-full text-sm font-sans hover:opacity-90 transition-opacity duration-200"
                >
                  Go
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

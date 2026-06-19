'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CompassIcon from '@/components/ui/CompassIcon'
import WorldMap from '@/components/map/WorldMap'
import DecadeButtons, { DECADES } from '@/components/controls/DecadeButtons'
import ModeSelector from '@/components/controls/ModeSelector'
import { FlowMode } from '@/lib/types'

interface Props {
  open: boolean
  initialAreas: string[]
  initialDecades: number[]
  initialMode: FlowMode
  fetching: boolean
  directionKey: string
  onClose: () => void
  onGo: (areas: string[], decades: number[], mode: FlowMode) => void
  onHome: () => void
}

export default function CompassPanel({
  open, initialAreas, initialDecades, initialMode, fetching, directionKey, onClose, onGo, onHome,
}: Props) {
  const [areas, setAreas] = useState<string[]>(initialAreas)
  const [decades, setDecades] = useState<number[]>(initialDecades)
  const [mode, setMode] = useState<FlowMode>(initialMode)

  // Re-sync the draft with the active filters each time the panel opens.
  useEffect(() => {
    if (open) {
      setAreas(initialAreas)
      setDecades(initialDecades)
      setMode(initialMode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggleArea = (area: string) =>
    setAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area])

  const toggleDecade = (d: number) =>
    setDecades(prev => {
      if (prev.length === 0) return [d]
      const next = prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
      return next.length === 0 || next.length === DECADES.length ? [] : next
    })

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative bg-ivory rounded-t-2xl px-6 pt-7 pb-10 pb-safe max-h-[88dvh] overflow-y-auto"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-6 max-w-md mx-auto">
              <div className="flex items-center gap-3">
                <CompassIcon size={20} spinning={mode === 'whirl' && fetching} nudge={directionKey} className="text-ink" />
                <span className="text-sm font-sans text-muted">New direction</span>
              </div>
              <div className="flex flex-col gap-2">
                <WorldMap selected={areas} onToggle={toggleArea} className="w-full" />
                <div className="flex justify-center">
                  <button
                    onClick={() => setAreas([])}
                    aria-pressed={areas.length === 0}
                    className={`px-4 py-1.5 rounded-full text-[13px] font-sans border transition-colors duration-200 ${
                      areas.length === 0 ? 'bg-terracotta border-terracotta text-ivory' : 'border-border text-muted'
                    }`}
                  >
                    Whole world
                  </button>
                </div>
              </div>
              <DecadeButtons selected={decades} onToggle={toggleDecade} />
              <ModeSelector mode={mode} onChange={setMode} />
              <div className="flex justify-between items-center">
                <button onClick={onHome} className="text-sm font-sans text-muted hover:text-terracotta transition-colors duration-200">
                  Back to home
                </button>
                <button
                  onClick={() => onGo(areas, decades, mode)}
                  className="px-6 py-2.5 bg-terracotta text-ivory rounded-full text-sm font-sans hover:opacity-90 transition-opacity duration-200"
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

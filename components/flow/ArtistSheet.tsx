'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { countryName } from '@/lib/geo'

export interface ArtistInfo {
  name: string
  bioShort: string | null
  country: string | null
  macroArea: string | null
}

interface Props {
  open: boolean
  fallbackName: string
  fallbackCountry: string
  fallbackArea: string
  info: ArtistInfo | null
  loading: boolean
  onClose: () => void
  onListenMore: () => void
}

export default function ArtistSheet({
  open, fallbackName, fallbackCountry, fallbackArea, info, loading, onClose, onListenMore,
}: Props) {
  const country = info?.country || fallbackCountry

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative bg-sand rounded-t-2xl w-full max-w-md px-6 pt-7 pb-10 pb-safe"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <h2 className="font-serif text-xl mb-1">{fallbackName}</h2>
            {country ? (
              <p className="text-[12px] font-sans text-muted mb-4">
                {countryName(country)}{fallbackArea ? ` · ${fallbackArea}` : ''}
              </p>
            ) : <div className="mb-4" />}
            {loading ? (
              <p className="text-[14px] font-sans text-muted mb-6">…</p>
            ) : info?.bioShort ? (
              <p className="text-[14px] font-sans leading-relaxed opacity-80 mb-6">{info.bioShort}</p>
            ) : (
              <p className="text-[14px] font-sans text-muted mb-6">No notes on this artist yet.</p>
            )}
            <button
              onClick={onListenMore}
              className="w-full px-4 py-3 rounded-xl border border-pine text-pine text-[14px] font-sans hover:bg-pine hover:text-sand transition-colors duration-200"
            >
              Listen to more by this artist
            </button>
            <button onClick={onClose} className="mt-4 text-sm font-sans text-muted hover:text-pine transition-colors duration-200">
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

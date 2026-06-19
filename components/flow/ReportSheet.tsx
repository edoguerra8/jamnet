'use client'
import { motion, AnimatePresence } from 'framer-motion'

export type ReportReason = 'wrong_video' | 'wrong_metadata'

interface Props {
  open: boolean
  onClose: () => void
  onReport: (reason: ReportReason) => void
}

export default function ReportSheet({ open, onClose, onReport }: Props) {
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
            <p className="text-sm font-sans text-muted mb-5">What seems wrong?</p>
            <div className="flex flex-col gap-3">
              <button onClick={() => onReport('wrong_video')} className="w-full text-left px-4 py-3 rounded-xl border border-border text-[14px] font-sans hover:border-pine hover:text-pine transition-colors duration-200">
                Wrong audio — this track doesn&apos;t match
              </button>
              <button onClick={() => onReport('wrong_metadata')} className="w-full text-left px-4 py-3 rounded-xl border border-border text-[14px] font-sans hover:border-pine hover:text-pine transition-colors duration-200">
                Wrong metadata — title, artist or year is incorrect
              </button>
            </div>
            <button onClick={onClose} className="mt-5 text-sm font-sans text-muted hover:text-pine transition-colors duration-200">
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

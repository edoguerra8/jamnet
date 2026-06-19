'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Track } from '@/lib/types'
import { useMusicKit } from '@/lib/player/useMusicKit'
import { saveToAppleMusic } from '@/lib/player/appleLibrary'

interface Props {
  open: boolean
  name: string
  tracks: Track[]
  onClose: () => void
}

type SaveStatus = 'idle' | 'saving' | 'done' | 'error'

// Share screen (sez. 5.3): "Save to Apple Music" (primary) + native "Share" (secondary),
// with an optional note. Save creates a real playlist in the user's Apple Music library.
export default function ShareSheet({ open, name, tracks, onClose }: Props) {
  const mk = useMusicKit()
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [result, setResult] = useState<{ saved: number; total: number } | null>(null)

  const playable = tracks.filter(t => t.appleMusId)

  const handleSave = async () => {
    setStatus('saving')
    try {
      const r = await saveToAppleMusic(
        mk.instance(), name, playable.map(t => t.appleMusId!), tracks.length, note || undefined,
      )
      setResult(r)
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  const handleShare = async () => {
    const url = window.location.origin
    const text = note ? `${note}\n\n${name} — via JamNet` : `${name} — via JamNet`
    try {
      if (navigator.share) await navigator.share({ title: name, text, url })
      else await navigator.clipboard.writeText(`${text}\n${url}`)
    } catch { /* cancelled */ }
  }

  const close = () => { setStatus('idle'); setResult(null); setNote(''); onClose() }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={close} />
          <motion.div
            className="relative bg-ivory rounded-t-2xl w-full max-w-md px-6 pt-7 pb-10 pb-safe"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <h2 className="font-serif text-xl mb-1">{name}</h2>
            <p className="text-[12px] font-sans text-muted mb-5">
              {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
            </p>

            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add a note"
              className="w-full mb-5 px-3 py-2.5 rounded-xl border border-border bg-transparent text-[14px] font-sans focus:outline-none focus:border-terracotta transition-colors"
            />

            <button
              onClick={handleSave}
              disabled={status === 'saving' || playable.length === 0}
              className="w-full mb-3 px-4 py-3 rounded-xl bg-terracotta text-ivory text-[14px] font-sans hover:opacity-90 active:scale-[0.99] transition-all duration-200 disabled:opacity-50"
            >
              {status === 'saving' ? 'Saving…' : status === 'done' ? 'Saved' : 'Save to Apple Music'}
            </button>

            {status === 'done' && result && result.saved < result.total && (
              <p className="text-[12px] font-sans text-muted mb-3 text-center">
                {result.saved} of {result.total} songs saved to Apple Music
              </p>
            )}
            {status === 'error' && (
              <p className="text-[12px] font-sans text-muted mb-3 text-center">
                Couldn&apos;t save. Make sure you&apos;re signed in to Apple Music.
              </p>
            )}

            <button
              onClick={handleShare}
              className="w-full px-4 py-3 rounded-xl border border-border text-[14px] font-sans hover:border-terracotta hover:text-terracotta transition-colors duration-200"
            >
              Share
            </button>

            <button onClick={close} className="mt-4 w-full text-center text-sm font-sans text-muted hover:text-terracotta transition-colors duration-200">
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

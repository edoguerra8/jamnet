'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import CompassIcon from '@/components/CompassIcon'
import HeartButton from '@/components/HeartButton'
import { Track } from '@/lib/types'
import { toggleSaved, isSaved } from '@/lib/saved'

export default function FlowContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const query = searchParams.get('q') ?? ''

  const [tracks, setTracks] = useState<Track[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fetchingMore, setFetchingMore] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [panelOpen, setPanelOpen] = useState(false)
  const [newQuery, setNewQuery] = useState('')

  const audioRef = useRef<HTMLAudioElement>(null)
  const queryRef = useRef(query)
  const fetchingMoreRef = useRef(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTracks = useCallback(async (q: string, append = false) => {
    if (append) {
      if (fetchingMoreRef.current) return
      fetchingMoreRef.current = true
      setFetchingMore(true)
    } else {
      setLoading(true)
    }

    try {
      const res = await fetch(`/api/discover?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (append) {
        setTracks(prev => [...prev, ...data.tracks])
      } else {
        setTracks(data.tracks)
        setIndex(0)
      }
    } catch {
      // silent — already showing whatever we have
    } finally {
      setLoading(false)
      setFetchingMore(false)
      fetchingMoreRef.current = false
    }
  }, [])

  useEffect(() => {
    queryRef.current = query
    fetchTracks(query)
  }, [query, fetchTracks])

  // Load saved IDs from localStorage on mount
  useEffect(() => {
    const saved = new Set(
      (JSON.parse(localStorage.getItem('jamnet_saved') || '[]') as Track[]).map(t => t.id)
    )
    setSavedIds(saved)
  }, [])

  // ── Current track ──────────────────────────────────────────────────────────

  const current = tracks[index]

  // Play track and prefetch more when running low
  useEffect(() => {
    if (!current?.previewUrl) return

    if (audioRef.current) {
      audioRef.current.src = current.previewUrl
      if (hasInteracted) {
        audioRef.current.play().catch(() => {})
      }
    }

    if (index >= tracks.length - 4) {
      fetchTracks(queryRef.current, true)
    }
  }, [index, current, hasInteracted, tracks.length, fetchTracks])

  // ── Interactions ───────────────────────────────────────────────────────────

  const nextTrack = useCallback(() => {
    setIndex(i => (i < tracks.length - 1 ? i + 1 : i))
  }, [tracks.length])

  const handleTap = () => {
    if (hasInteracted || !audioRef.current) return
    setHasInteracted(true)
    audioRef.current.play().catch(() => {})
  }

  const handleToggleSave = () => {
    if (!current) return
    const nowSaved = toggleSaved(current)
    setSavedIds(prev => {
      const next = new Set(prev)
      nowSaved ? next.add(current.id) : next.delete(current.id)
      return next
    })
  }

  const handleDragEnd = (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
    if (info.offset.y < -60 || info.velocity.y < -400) nextTrack()
  }

  const reorient = (q: string) => router.push(`/flow?q=${encodeURIComponent(q)}`)

  const handleNewDirection = () => {
    if (!newQuery.trim()) return
    setPanelOpen(false)
    router.push(`/flow?q=${encodeURIComponent(newQuery.trim())}`)
  }

  // ── Loading / empty states ─────────────────────────────────────────────────

  if (loading && tracks.length === 0) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-ivory dark:bg-dark-bg gap-4">
        <CompassIcon spinning size={48} className="text-ink dark:text-ivory" />
        <p className="text-sm font-sans text-muted">Finding music…</p>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-ivory dark:bg-dark-bg gap-6 px-8 text-center">
        <CompassIcon size={36} className="text-muted" />
        <p className="font-sans text-muted text-sm">Nothing found. Try a different direction.</p>
        <button
          onClick={() => router.push('/')}
          className="text-sm font-sans text-terracotta underline underline-offset-4"
        >
          Back to home
        </button>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <>
      <audio ref={audioRef} preload="auto" onEnded={nextTrack} />

      <motion.main
        className="h-dvh overflow-hidden bg-ivory dark:bg-dark-bg select-none cursor-default"
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.14, bottom: 0.02 }}
        onDragEnd={handleDragEnd}
        onClick={handleTap}
        style={{ touchAction: 'none' }}
      >
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-20 flex justify-between items-center px-6 pt-6 pt-safe">
          <button
            onClick={(e) => { e.stopPropagation(); router.push('/') }}
            className="font-serif text-base opacity-50 hover:opacity-100 transition-opacity"
          >
            JamNet
          </button>
        </div>

        {/* Track content */}
        <div className="h-full flex flex-col items-center justify-between px-6 pt-20 pb-10 pb-safe">

          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              className="w-full flex flex-col items-center gap-5"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -28 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
            >
              {/* Album art */}
              <div className="w-full max-w-xs aspect-square rounded-xl overflow-hidden shadow-md bg-parchment dark:bg-dark-surface">
                {current.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={current.artworkUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <CompassIcon size={48} className="text-muted/40" />
                  </div>
                )}
              </div>

              {/* Track info */}
              <div className="w-full max-w-xs flex flex-col gap-1">
                <h1 className="font-serif text-[1.6rem] leading-tight">
                  {current.title}
                </h1>
                <button
                  onClick={(e) => { e.stopPropagation(); reorient(current.artist) }}
                  className="text-left text-base font-sans opacity-65 hover:text-terracotta hover:opacity-100 transition-all w-fit"
                >
                  {current.artist}
                </button>
                <div className="flex items-center gap-2 text-[13px] font-sans text-muted">
                  <button
                    onClick={(e) => { e.stopPropagation(); reorient(current.genre) }}
                    className="hover:text-terracotta transition-colors"
                  >
                    {current.genre}
                  </button>
                  <span className="opacity-40">·</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); reorient(String(current.year)) }}
                    className="hover:text-terracotta transition-colors"
                  >
                    {current.year}
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Tap-to-play hint */}
          <AnimatePresence>
            {!hasInteracted && (
              <motion.p
                className="absolute bottom-32 text-xs font-sans text-muted pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.7 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.6 }}
              >
                Tap to play
              </motion.p>
            )}
          </AnimatePresence>

          {/* Bottom controls */}
          <div className="w-full max-w-xs flex justify-between items-center">
            <HeartButton
              saved={savedIds.has(current.id)}
              onToggle={handleToggleSave}
              size={28}
            />

            {/* Compass — opens direction panel */}
            <button
              onClick={(e) => { e.stopPropagation(); setPanelOpen(true) }}
              className="flex items-center justify-center p-2 -m-2 group"
              aria-label="Change direction"
            >
              <CompassIcon
                spinning={fetchingMore}
                size={28}
                className="text-ink dark:text-ivory opacity-50 group-hover:opacity-100 group-hover:text-terracotta transition-all"
              />
            </button>
          </div>
        </div>

        {/* Swipe hint (first track only) */}
        <AnimatePresence>
          {hasInteracted && index === 0 && (
            <motion.div
              className="absolute bottom-20 inset-x-0 flex justify-center pointer-events-none"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 0.4, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 2, duration: 0.5 }}
            >
              <svg viewBox="0 0 16 20" width="14" height="18" fill="currentColor" className="text-muted">
                <path d="M8 0L3 7h4v6h2V7h4L8 0z" />
                <rect x="6" y="15" width="4" height="2" rx="1" />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.main>

      {/* Direction panel */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-ink/20 dark:bg-black/50 backdrop-blur-sm"
              onClick={() => setPanelOpen(false)}
            />

            {/* Sheet */}
            <motion.div
              className="relative bg-ivory dark:bg-dark-surface rounded-t-2xl px-6 pt-8 pb-10 pb-safe"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-3">
                  <CompassIcon size={20} className="text-terracotta" />
                  <span className="text-sm font-sans text-muted">New direction</span>
                </div>

                <input
                  type="text"
                  value={newQuery}
                  onChange={(e) => setNewQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNewDirection()}
                  placeholder="Where to?"
                  className="w-full px-0 py-2 text-xl font-serif bg-transparent border-b border-ink/20 dark:border-ivory/20 focus:outline-none focus:border-terracotta placeholder:text-muted/40 transition-colors"
                  autoFocus
                />

                <div className="flex justify-between items-center">
                  <button
                    onClick={() => router.push('/')}
                    className="text-sm font-sans text-muted hover:text-terracotta transition-colors"
                  >
                    Back to home
                  </button>
                  <button
                    onClick={handleNewDirection}
                    disabled={!newQuery.trim()}
                    className="px-5 py-2 bg-terracotta text-ivory rounded-full text-sm font-sans hover:opacity-90 transition-opacity disabled:opacity-30"
                  >
                    Go
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

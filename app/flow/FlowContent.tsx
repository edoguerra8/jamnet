'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import CompassIcon from '@/components/CompassIcon'
import HeartButton, { SaveState } from '@/components/HeartButton'
import RangeSlider from '@/components/RangeSlider'
import { Track } from '@/lib/types'
import {
  isInGenrePlaylist, addToGenrePlaylist,
  isInAnyCompilation, addToDefaultCompilation,
} from '@/lib/saved'
import { buildInitialStrategies, strategiesFromArtists } from '@/lib/strategies'

const AREAS = [
  'All', 'West Africa', 'North Africa', 'Middle East',
  'South Asia', 'East Asia', 'Southeast Asia',
  'Latin America', 'Caribbean', 'Europe', 'North America', 'Oceania',
]

const MIN_YEAR = 1950
const MAX_YEAR = 2026
const SEEN_KEY = 'jamnet_seen'
const QUEUE_KEY = 'jamnet_queue'
const BATCH = 4  // strategies per API call

function getSeenIds(): string[] {
  try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]') } catch { return [] }
}
function addSeenIds(ids: string[]) {
  try {
    const s = new Set(getSeenIds())
    ids.forEach(id => s.add(id))
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...s]))
  } catch {}
}

// ── Strategy queue ─────────────────────────────────────────────────────────────
function getQueue(): string[] {
  try { return JSON.parse(sessionStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}
function setQueue(q: string[]) {
  try { sessionStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(0, 600))) } catch {}
}
function popBatch(n: number): string[] {
  const q = getQueue()
  const batch: string[] = []
  const remaining: string[] = []
  let mbCount = 0
  for (const s of q) {
    if (batch.length >= n) {
      remaining.push(s)
    } else if (s.startsWith('m::')) {
      // At most 1 MusicBrainz strategy per batch to respect rate limits
      if (mbCount === 0) { batch.push(s); mbCount++ } else { remaining.push(s) }
    } else {
      batch.push(s)
    }
  }
  setQueue(remaining)
  return batch
}
function addToQueue(strats: string[]) {
  const q = getQueue()
  const existing = new Set(q)
  const toAdd = strats.filter(s => !existing.has(s))
  setQueue([...q, ...toAdd])
}

function buildFlowUrl(areas: string[], yf: number, yt: number) {
  const p = new URLSearchParams()
  const filtered = areas.filter(a => a !== 'All')
  if (filtered.length > 0) p.set('areas', filtered.join(','))
  if (yf !== MIN_YEAR) p.set('yearFrom', String(yf))
  if (yt !== MAX_YEAR) p.set('yearTo', String(yt))
  const str = p.toString()
  return `/flow${str ? `?${str}` : ''}`
}

function getSaveState(id: string): SaveState {
  if (!isInGenrePlaylist(id)) return 'none'
  if (isInAnyCompilation(id)) return 'both'
  return 'genre'
}

export default function FlowContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const areasParam = searchParams.get('areas') ?? ''
  const areas = areasParam ? areasParam.split(',').map(a => a.trim()).filter(Boolean) : ['All']
  const yearFrom = Math.max(MIN_YEAR, Math.min(MAX_YEAR, Number(searchParams.get('yearFrom') ?? MIN_YEAR)))
  const yearTo = Math.max(MIN_YEAR, Math.min(MAX_YEAR, Number(searchParams.get('yearTo') ?? MAX_YEAR)))

  const [tracks, setTracks] = useState<Track[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fetchingMore, setFetchingMore] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelAreas, setPanelAreas] = useState<string[]>(areas)
  const [panelYearFrom, setPanelYearFrom] = useState(yearFrom)
  const [panelYearTo, setPanelYearTo] = useState(yearTo)

  const audioRef = useRef<HTMLAudioElement>(null)
  const fetchingMoreRef = useRef(false)
  const areasRef = useRef(areas)
  const yearFromRef = useRef(yearFrom)
  const yearToRef = useRef(yearTo)
  const tracksRef = useRef(tracks)

  useEffect(() => { areasRef.current = areas; yearFromRef.current = yearFrom; yearToRef.current = yearTo })
  useEffect(() => { tracksRef.current = tracks }, [tracks])

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTracks = useCallback(async (
    a: string[], yf: number, yt: number, append = false
  ) => {
    if (append) {
      if (fetchingMoreRef.current) return
      fetchingMoreRef.current = true
      setFetchingMore(true)
    } else {
      setLoading(true)
    }
    try {
      let strategies: string[]

      if (!append) {
        // Fresh session: build full strategy queue, take first batch
        const initial = buildInitialStrategies(a, yf, yt)
        setQueue(initial.slice(BATCH))
        strategies = initial.slice(0, BATCH)
      } else {
        // Refill queue if running low
        if (getQueue().length < BATCH * 2) {
          addToQueue(buildInitialStrategies(a, yf, yt))
        }
        strategies = popBatch(BATCH)

        // Expand queue with strategies derived from recently discovered artists
        if (tracksRef.current.length > 0) {
          const useAll = a.length === 0 || a.includes('All')
          const region = useAll ? 'World' : a[0]
          const recentArtists = [...new Set(
            tracksRef.current.slice(-12).map(t => t.artist)
          )].slice(0, 4)
          addToQueue(strategiesFromArtists(recentArtists, region))
        }
      }

      const exclude = append ? getSeenIds().slice(-500) : []

      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategies, yearFrom: yf, yearTo: yt, exclude }),
      })
      const data = await res.json()
      const newTracks: Track[] = data.tracks ?? []
      addSeenIds(newTracks.map(t => t.id))

      const newStates: Record<string, SaveState> = {}
      for (const t of newTracks) newStates[t.id] = getSaveState(t.id)

      if (append) {
        setTracks(prev => [...prev, ...newTracks])
        setSaveStates(prev => ({ ...prev, ...newStates }))
      } else {
        setTracks(newTracks)
        setIndex(0)
        setSaveStates(newStates)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
      setFetchingMore(false)
      fetchingMoreRef.current = false
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchTracks(areas, yearFrom, yearTo, false) }, [searchParams])

  useEffect(() => {
    if (panelOpen) {
      setPanelAreas(areasRef.current)
      setPanelYearFrom(yearFromRef.current)
      setPanelYearTo(yearToRef.current)
    }
  }, [panelOpen])

  // ── Audio ──────────────────────────────────────────────────────────────────

  const current = tracks[index]

  useEffect(() => {
    if (!current?.previewUrl) return
    if (audioRef.current) {
      audioRef.current.src = current.previewUrl
      if (hasInteracted) audioRef.current.play().catch(() => {})
    }
    if (index >= tracks.length - 4) {
      fetchTracks(areasRef.current, yearFromRef.current, yearToRef.current, true)
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

  const handleSaveToGenre = () => {
    if (!current) return
    addToGenrePlaylist(current)
    setSaveStates(prev => ({ ...prev, [current.id]: 'genre' }))
  }

  const handleSaveToCompilation = () => {
    if (!current) return
    addToDefaultCompilation(current)
    setSaveStates(prev => ({ ...prev, [current.id]: 'both' }))
  }

  const handleDragEnd = (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
    if (info.offset.y < -60 || info.velocity.y < -400) nextTrack()
  }

  const handleRegionTap = (region: string) => {
    router.push(buildFlowUrl([region], yearFrom, yearTo))
  }

  const handleYearTap = (year: number) => {
    const decade = Math.floor(year / 10) * 10
    router.push(buildFlowUrl(areas, decade, Math.min(decade + 9, MAX_YEAR)))
  }

  const togglePanelArea = (area: string) => {
    if (area === 'All') { setPanelAreas(['All']); return }
    setPanelAreas(prev => {
      const withoutAll = prev.filter(a => a !== 'All')
      if (withoutAll.includes(area)) {
        const next = withoutAll.filter(a => a !== area)
        return next.length === 0 ? ['All'] : next
      }
      return [...withoutAll, area]
    })
  }

  // ── Loading / empty ────────────────────────────────────────────────────────

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
        <button onClick={() => router.push('/')} className="text-sm font-sans text-terracotta underline underline-offset-4">
          Back to home
        </button>
      </div>
    )
  }

  const isPanelAllYears = panelYearFrom === MIN_YEAR && panelYearTo === MAX_YEAR
  const currentSaveState = saveStates[current.id] ?? 'none'

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
          <button
            onClick={(e) => { e.stopPropagation(); router.push('/library') }}
            className="opacity-40 hover:opacity-100 transition-opacity"
            aria-label="Library"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 19V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13" strokeLinecap="round" />
              <path d="M4 19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2" />
              <line x1="9" y1="8" x2="15" y2="8" strokeLinecap="round" />
              <line x1="9" y1="12" x2="13" y2="12" strokeLinecap="round" />
            </svg>
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
                  <img src={current.artworkUrl} alt="" className="w-full h-full object-cover" draggable={false} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <CompassIcon size={48} className="text-muted/40" />
                  </div>
                )}
              </div>

              {/* Track info */}
              <div className="w-full max-w-xs flex flex-col gap-1">
                <h1 className="font-serif text-[1.6rem] leading-tight">{current.title}</h1>
                <span className="text-base font-sans opacity-65">{current.artist}</span>
                <div className="flex items-center gap-2 text-[13px] font-sans text-muted">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRegionTap(current.region) }}
                    className="hover:text-terracotta transition-colors"
                  >
                    {current.region !== 'All' ? current.region : current.genre}
                  </button>
                  <span className="opacity-40">·</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleYearTap(current.year) }}
                    className="hover:text-terracotta transition-colors"
                  >
                    {current.year}
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          <AnimatePresence>
            {!hasInteracted && (
              <motion.p
                className="absolute bottom-32 text-xs font-sans text-muted pointer-events-none"
                initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} exit={{ opacity: 0 }}
                transition={{ delay: 0.6 }}
              >
                Tap to play
              </motion.p>
            )}
          </AnimatePresence>

          {/* Bottom controls */}
          <div className="w-full max-w-xs flex justify-between items-center">
            <HeartButton
              saveState={currentSaveState}
              onSaveToGenre={handleSaveToGenre}
              onSaveToCompilation={handleSaveToCompilation}
              size={28}
            />
            <button
              onClick={(e) => { e.stopPropagation(); setPanelOpen(true) }}
              className="flex items-center justify-center p-2 -m-2 group"
              aria-label="Change direction"
            >
              <CompassIcon
                spinning={fetchingMore} size={28}
                className="text-ink dark:text-ivory opacity-50 group-hover:opacity-100 group-hover:text-terracotta transition-all"
              />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {hasInteracted && index === 0 && (
            <motion.div
              className="absolute bottom-20 inset-x-0 flex justify-center pointer-events-none"
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 0.4, y: 0 }} exit={{ opacity: 0 }}
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
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-ink/20 dark:bg-black/50 backdrop-blur-sm" onClick={() => setPanelOpen(false)} />
            <motion.div
              className="relative bg-ivory dark:bg-dark-surface rounded-t-2xl px-6 pt-8 pb-10 pb-safe"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-3">
                  <CompassIcon size={20} className="text-terracotta" />
                  <span className="text-sm font-sans text-muted">New direction</span>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-sans text-muted uppercase tracking-widest">Area</span>
                  <div className="flex flex-wrap gap-2">
                    {AREAS.map(area => (
                      <button
                        key={area}
                        onClick={() => togglePanelArea(area)}
                        className={`px-3 py-1.5 rounded-full text-[13px] font-sans border transition-all ${
                          panelAreas.includes(area)
                            ? 'bg-terracotta border-terracotta text-ivory'
                            : 'border-ink/20 dark:border-ivory/20 text-muted hover:border-terracotta hover:text-terracotta'
                        }`}
                      >
                        {area}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-sans text-muted uppercase tracking-widest">Period</span>
                    <span className="text-sm font-sans text-muted tabular-nums">
                      {isPanelAllYears ? 'All years' : `${panelYearFrom} – ${panelYearTo}`}
                    </span>
                  </div>
                  <RangeSlider
                    min={MIN_YEAR} max={MAX_YEAR}
                    from={panelYearFrom} to={panelYearTo}
                    onChange={(f, t) => { setPanelYearFrom(f); setPanelYearTo(t) }}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <button onClick={() => router.push('/')} className="text-sm font-sans text-muted hover:text-terracotta transition-colors">
                    Back to home
                  </button>
                  <button
                    onClick={() => { setPanelOpen(false); router.push(buildFlowUrl(panelAreas, panelYearFrom, panelYearTo)) }}
                    className="px-5 py-2 bg-terracotta text-ivory rounded-full text-sm font-sans hover:opacity-90 transition-opacity"
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

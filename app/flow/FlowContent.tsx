'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import CompassIcon from '@/components/ui/CompassIcon'
import { SaveState } from '@/components/ui/HeartButton'
import TrackCard from '@/components/flow/TrackCard'
import PlayerControls from '@/components/flow/PlayerControls'
import CompassPanel from '@/components/flow/CompassPanel'
import ArtistSheet, { ArtistInfo } from '@/components/flow/ArtistSheet'
import ReportSheet, { ReportReason } from '@/components/flow/ReportSheet'
import { DECADES } from '@/components/controls/DecadeButtons'
import { Track } from '@/lib/types'
import { isInGenrePlaylist, addToGenrePlaylist, isInAnyCompilation, addToDefaultCompilation } from '@/lib/storage/saved'
import { addToHistory } from '@/lib/storage/history'
import { useMusicKit } from '@/lib/player/useMusicKit'
import { bearingFor } from '@/lib/geo'

// ── Constants ──────────────────────────────────────────────────────────────

const SEEN_KEY = 'jamnet_seen'
const PLAY_QUEUE_KEY = 'jamnet_play_queue'   // sessionStorage handoff for sequence playback
const REFETCH_THRESHOLD = 3
const SCRUB_START_MS = 320   // first fast-scrub interval
const SCRUB_MIN_MS   = 70    // fastest interval (acceleration floor)

// ── Seen-IDs helpers (anti-repeat across the session) ───────────────────────

function getSeenIds(): string[] {
  try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]') } catch { return [] }
}
function addSeenId(id: string) {
  try {
    const s = new Set(getSeenIds())
    s.add(id)
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-600)))
  } catch {}
}

// ── URL helpers ─────────────────────────────────────────────────────────────

interface FlowFilters {
  areas?: string[]
  decades?: number[]
  now?: boolean          // "Now" = new releases (is_new_release)
  country?: string
  artistMbId?: string
  artistName?: string
}

function buildFlowUrl(f: FlowFilters) {
  const p = new URLSearchParams()
  if (f.areas?.length)   p.set('areas',     f.areas.join(','))
  const dec = [...(f.decades ?? []).map(String), ...(f.now ? ['now'] : [])]
  if (dec.length)        p.set('decades',   dec.join(','))
  if (f.country)         p.set('country',   f.country)
  if (f.artistMbId)      p.set('artist',    f.artistMbId)
  if (f.artistName)      p.set('artistName', f.artistName)
  const str = p.toString()
  return `/flow${str ? `?${str}` : ''}`
}

function getSaveState(id: string): SaveState {
  if (!isInGenrePlaylist(id)) return 'none'
  if (isInAnyCompilation(id)) return 'both'
  return 'genre'
}

// Human-readable message for a playback failure (shown briefly to the user).
function playErrorMessage(e: unknown): string {
  const m = (e as { message?: string })?.message || ''
  if (/subscription|MusicUserToken|unauthorized|forbidden|403|401/i.test(m)) {
    return 'Apple Music sign-in needed — tap play again'
  }
  return 'Couldn’t play this track — tap play again'
}

// ── Component ───────────────────────────────────────────────────────────────

export default function FlowContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const areasParam = searchParams.get('areas') ?? ''
  const areas = areasParam ? areasParam.split(',').map(a => a.trim()).filter(Boolean) : []
  const decadesParam = searchParams.get('decades') ?? ''
  const decades = decadesParam
    ? decadesParam.split(',').map(Number).filter(d => DECADES.includes(d))
    : []
  const nowActive = decadesParam.split(',').includes('now')   // "Now" = new releases
  const country         = searchParams.get('country') ?? ''
  const artistMbId      = searchParams.get('artist') ?? ''
  const artistNameParam = searchParams.get('artistName') ?? ''
  const sharedTrackId   = searchParams.get('track') ?? ''
  const listMode        = searchParams.get('source') === 'list'   // sequence playback of a saved list

  // ── State ────────────────────────────────────────────────────────────────

  const [queue,         setQueue]         = useState<Track[]>([])
  const [index,         setIndex]         = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [fetching,      setFetching]      = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)
  const [saveStates,    setSaveStates]    = useState<Record<string, SaveState>>({})
  const [usingPreview,  setUsingPreview]  = useState(false)
  const [scrubbing,     setScrubbing]     = useState<1 | -1 | null>(null)
  const [playerError,   setPlayerError]   = useState<string | null>(null)

  // Overlays
  const [panelOpen,     setPanelOpen]     = useState(false)
  const [reportOpen,    setReportOpen]    = useState(false)
  const [reportSent,    setReportSent]    = useState(false)
  const [artistOpen,    setArtistOpen]    = useState(false)
  const [artistInfo,    setArtistInfo]    = useState<ArtistInfo | null>(null)
  const [artistLoading, setArtistLoading] = useState(false)
  const [linkCopied,    setLinkCopied]    = useState(false)

  // ── Refs ─────────────────────────────────────────────────────────────────

  const audioRef         = useRef<HTMLAudioElement>(null)
  const fetchingRef      = useRef(false)
  const filtersRef       = useRef<FlowFilters>({})
  const queueRef         = useRef(queue)
  const indexRef         = useRef(index)
  const hasInteractedRef = useRef(hasInteracted)
  const loadedIdRef      = useRef<string | null>(null)   // appleMusId currently queued in MusicKit
  const settleRef        = useRef<(() => void) | null>(null)
  const scrubbingRef     = useRef<1 | -1 | null>(null)
  const scrubTimerRef    = useRef<number | null>(null)
  const scrubDelayRef    = useRef(SCRUB_START_MS)
  const scrubSafetyRef   = useRef<number | null>(null)   // hard stop if pointerup is lost

  useEffect(() => {
    filtersRef.current = {
      areas, decades, now: nowActive, country: country || undefined,
      artistMbId: artistMbId || undefined,
      artistName: artistNameParam || undefined,
    }
  })
  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { indexRef.current = index }, [index])
  useEffect(() => { hasInteractedRef.current = hasInteracted }, [hasInteracted])

  const current = queue[index]

  // ── Index helpers ──────────────────────────────────────────────────────────

  const stepIndex = useCallback((dir: 1 | -1) => {
    setIndex(i => {
      const q = queueRef.current
      const ni = i + dir
      return ni < 0 ? 0 : ni > q.length - 1 ? Math.max(0, q.length - 1) : ni
    })
  }, [])

  // ── MusicKit (Apple Music) ──────────────────────────────────────────────────

  const handleEnded = useCallback(() => { stepIndex(1) }, [stepIndex])
  const mk = useMusicKit(handleEnded)

  // Show a brief message at the bottom of the player (errors, status).
  const flashError = useCallback((msg: string) => {
    setPlayerError(msg)
    window.setTimeout(() => setPlayerError(null), 3500)
  }, [])

  // Load & play the track at the current index (Apple Music, else iTunes preview).
  const loadCurrent = useCallback(() => {
    const cur = queueRef.current[indexRef.current]
    if (!cur) return
    const audio = audioRef.current

    if (cur.appleMusId) {
      // Playable via Apple Music. If MusicKit isn't ready yet (still loading, or a
      // non-Safari browser) we WAIT — never auto-skip — using the preview as a
      // stopgap when one exists. The mk.ready effect re-settles once it loads.
      if (audio) { audio.pause(); audio.src = '' }
      if (mk.ready) {
        setUsingPreview(false)
        if (!hasInteractedRef.current) { loadedIdRef.current = null; return } // authorize only from a gesture
        loadedIdRef.current = cur.appleMusId
        mk.playSong(cur.appleMusId).catch((e) => {
          console.error('[play] playSong failed:', e)
          loadedIdRef.current = null
          if (cur.previewUrl && audio) {
            setUsingPreview(true)
            audio.src = cur.previewUrl
            audio.play().catch(() => {})
          } else {
            flashError(playErrorMessage(e))
          }
        })
      } else if (cur.previewUrl && audio) {
        setUsingPreview(true)
        audio.src = cur.previewUrl
        if (hasInteractedRef.current) audio.play().catch(() => {})
      } else {
        setUsingPreview(false)
      }
    } else if (cur.previewUrl) {
      mk.stop()
      loadedIdRef.current = null
      setUsingPreview(true)
      if (audio) {
        audio.src = cur.previewUrl
        if (hasInteractedRef.current) audio.play().catch(() => {})
      }
    } else {
      // Truly nothing playable (shouldn't happen — discover only returns playable
      // tracks). Skip forward as a last resort.
      stepIndex(1)
    }
  }, [mk, stepIndex, flashError])

  // Side-effects when a track becomes the settled "current": history, report reset, playback.
  const settle = useCallback(() => {
    const cur = queueRef.current[indexRef.current]
    if (!cur) return
    setReportSent(false)
    addToHistory(cur)
    loadCurrent()
  }, [loadCurrent])

  useEffect(() => { settleRef.current = settle })

  // ── Fetch tracks from Supabase ────────────────────────────────────────────

  const fetchTracks = useCallback(async (append: boolean) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    if (append) setFetching(true)
    else        setLoading(true)

    try {
      const f = filtersRef.current
      // Last few played tracks → the engine keeps musical continuity and avoids repeats
      const recent = queueRef.current.slice(Math.max(0, indexRef.current - 5), indexRef.current + 1)
      const body = {
        areas:       f.areas   ?? [],
        decades:     [...(f.decades ?? []), ...(f.now ? ['now'] : [])],
        country:     f.country    ?? null,
        artistMbId:  f.artistMbId ?? null,
        artistName:  f.artistName ?? null,
        recent:      recent.map(t => ({ country: t.country, macroArea: t.macroArea, tags: t.tags, year: t.year, artist: t.artist })),
        exclude:     getSeenIds().slice(-400),
      }
      const res  = await fetch('/api/discover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      const newTracks: Track[] = data.tracks ?? []

      for (const t of newTracks) addSeenId(t.id)
      const newStates: Record<string, SaveState> = {}
      for (const t of newTracks) newStates[t.id] = getSaveState(t.id)

      if (append) {
        setQueue(prev => [...prev, ...newTracks])
        setSaveStates(prev => ({ ...prev, ...newStates }))
      } else {
        setQueue(newTracks)
        setIndex(0)
        setSaveStates(newStates)
      }
    } catch { /* silent */ }
    finally {
      setLoading(false)
      setFetching(false)
      fetchingRef.current = false
    }
  }, [])

  // Initial load (shared track link, or a fresh fetch)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (listMode) {
        try {
          const stored = JSON.parse(sessionStorage.getItem(PLAY_QUEUE_KEY) || '[]') as Track[]
          if (!cancelled && stored.length) {
            for (const t of stored) addSeenId(t.id)
            const states: Record<string, SaveState> = {}
            for (const t of stored) states[t.id] = getSaveState(t.id)
            setQueue(stored); setIndex(0); setSaveStates(states); setLoading(false)
            return
          }
        } catch { /* fall through to normal discovery */ }
      }
      if (sharedTrackId) {
        setLoading(true)
        try {
          const res  = await fetch(`/api/track?id=${encodeURIComponent(sharedTrackId)}`)
          const data = await res.json()
          if (!cancelled && data.track) {
            addSeenId(data.track.id)
            setQueue([data.track])
            setIndex(0)
            setSaveStates({ [data.track.id]: getSaveState(data.track.id) })
            setLoading(false)
            return
          }
        } catch { /* fall through */ }
      }
      if (!cancelled) fetchTracks(false)
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Prefetch more when the queue runs low (also feeds forward fast-scroll).
  // Skipped in list mode — a saved list plays exactly its tracks, no discovery.
  useEffect(() => {
    if (!current || listMode) return
    const remaining = queue.length - index
    if (remaining < REFETCH_THRESHOLD && !fetching && !loading) fetchTracks(true)
  }, [index, queue.length, current, fetching, loading, fetchTracks, listMode])

  // React to the settled current track (skipped while fast-scrubbing)
  useEffect(() => {
    if (!current) return
    if (scrubbingRef.current) return
    settleRef.current?.()
  }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // If the user pressed play before MusicKit finished loading, start once it's ready
  useEffect(() => {
    if (mk.ready && hasInteractedRef.current && !scrubbingRef.current && !loadedIdRef.current) {
      settleRef.current?.()
    }
  }, [mk.ready])

  // ── Fast-scrub (VHS-style) ──────────────────────────────────────────────────

  const stopScrub = useCallback(() => {
    if (scrubTimerRef.current)  { clearTimeout(scrubTimerRef.current);  scrubTimerRef.current = null }
    if (scrubSafetyRef.current) { clearTimeout(scrubSafetyRef.current); scrubSafetyRef.current = null }
    if (scrubbingRef.current === null) return
    scrubbingRef.current = null
    setScrubbing(null)
    settleRef.current?.()  // land: play the track we stopped on
  }, [])
  const stopScrubRef = useRef(stopScrub)
  useEffect(() => { stopScrubRef.current = stopScrub })

  const scrubTick = useCallback(() => {
    const dir = scrubbingRef.current
    if (!dir) return
    stepIndex(dir)
    scrubDelayRef.current = Math.max(SCRUB_MIN_MS, Math.round(scrubDelayRef.current * 0.82))
    scrubTimerRef.current = window.setTimeout(scrubTick, scrubDelayRef.current)
  }, [stepIndex])

  const startScrub = useCallback((dir: 1 | -1) => {
    setHasInteracted(true); hasInteractedRef.current = true
    scrubbingRef.current = dir
    setScrubbing(dir)
    scrubDelayRef.current = SCRUB_START_MS
    stepIndex(dir)
    scrubTimerRef.current = window.setTimeout(scrubTick, scrubDelayRef.current)
    // Safety net: if pointerup is somehow lost, stop after a few seconds.
    if (scrubSafetyRef.current) clearTimeout(scrubSafetyRef.current)
    scrubSafetyRef.current = window.setTimeout(() => stopScrubRef.current(), 6000)
  }, [scrubTick, stepIndex])

  const onStep = useCallback((dir: 1 | -1) => {
    setHasInteracted(true); hasInteractedRef.current = true
    stepIndex(dir)
  }, [stepIndex])

  // Stop scrubbing if the tab is hidden or the window loses focus (lost pointerup guard)
  useEffect(() => {
    const stop = () => stopScrubRef.current()
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', stop)
    return () => {
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', stop)
      if (scrubTimerRef.current)  clearTimeout(scrubTimerRef.current)
      if (scrubSafetyRef.current) clearTimeout(scrubSafetyRef.current)
    }
  }, [])

  // ── Play / pause ─────────────────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const cur = queueRef.current[indexRef.current]
    if (!cur) return
    setHasInteracted(true); hasInteractedRef.current = true

    if (cur.appleMusId && mk.ready) {
      if (mk.isPlaying) { mk.pause(); return }
      if (loadedIdRef.current === cur.appleMusId) { mk.resume().catch(() => {}); return }
      loadedIdRef.current = cur.appleMusId
      mk.playSong(cur.appleMusId).catch((e) => {
        console.error('[play] playSong failed:', e)
        loadedIdRef.current = null
        if (cur.previewUrl && audioRef.current) {
          setUsingPreview(true)
          audioRef.current.src = cur.previewUrl
          audioRef.current.play().catch(() => {})
        } else {
          flashError(playErrorMessage(e))
        }
      })
    } else if (cur.appleMusId && !mk.ready) {
      // MusicKit still loading — it will auto-play once ready (mk.ready effect). Give feedback.
      flashError('Connecting to Apple Music…')
    } else if (cur.previewUrl && audioRef.current) {
      if (audioRef.current.paused) audioRef.current.play().catch(() => {})
      else audioRef.current.pause()
    } else {
      flashError('This track isn’t playable')
    }
  }, [mk, flashError])

  const isPlaying = mk.isPlaying || (usingPreview && !!audioRef.current && !audioRef.current.paused)

  // ── Save handlers ─────────────────────────────────────────────────────────

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

  // ── Taps on the track card (sez. 4.3) ────────────────────────────────────

  const goWithFilters = (f: FlowFilters) => router.push(buildFlowUrl(f))

  const handleAreaTap = (area: string) => {
    const f = filtersRef.current
    goWithFilters({ areas: [area], decades: f.decades })
  }
  const handleCountryTap = (code: string) => {
    const f = filtersRef.current
    goWithFilters({ country: code, decades: f.decades })
  }
  const handleYearTap = (year: number) => {
    if (!year) return
    const decade = Math.min(2020, Math.max(1950, Math.floor(year / 10) * 10))
    const f = filtersRef.current
    goWithFilters({ areas: f.areas, country: f.country, decades: [decade] })
  }

  const openArtistCard = async () => {
    if (!current) return
    setArtistOpen(true)
    setArtistLoading(true)
    setArtistInfo(null)
    try {
      const q = current.artist_mb_id
        ? `mbId=${encodeURIComponent(current.artist_mb_id)}`
        : `name=${encodeURIComponent(current.artist)}`
      const res  = await fetch(`/api/artist?${q}`)
      const data = await res.json()
      setArtistInfo(data.artist
        ? { name: data.artist.name, bioShort: data.artist.bioShort, country: data.artist.country, macroArea: data.artist.macroArea }
        : { name: current.artist, bioShort: null, country: null, macroArea: null })
    } catch {
      setArtistInfo({ name: current.artist, bioShort: null, country: null, macroArea: null })
    } finally {
      setArtistLoading(false)
    }
  }

  const listenToArtist = () => {
    if (!current) return
    setArtistOpen(false)
    goWithFilters(current.artist_mb_id
      ? { artistMbId: current.artist_mb_id, artistName: current.artist }
      : { artistName: current.artist })
  }

  // ── Share ────────────────────────────────────────────────────────────────

  const shareTrack = async () => {
    if (!current) return
    const url = `${window.location.origin}/flow?track=${current.id}`
    try {
      if (navigator.share) { await navigator.share({ title: `${current.title} — ${current.artist}`, url }); return }
    } catch { return }
    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {}
  }

  // ── Report ────────────────────────────────────────────────────────────────

  const sendReport = async (reason: ReportReason) => {
    if (!current || reportSent) return
    setReportOpen(false)
    setReportSent(true)
    try {
      await fetch('/api/report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: current.id, motivo: reason }),
      })
    } catch { /* silent */ }
  }

  // ── Loading / empty states ────────────────────────────────────────────────

  if (loading && queue.length === 0) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-sand gap-4">
        <CompassIcon spinning size={48} className="text-ink" />
        <p className="text-sm font-sans text-muted">Finding music…</p>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-sand gap-6 px-8 text-center">
        <CompassIcon size={36} className="text-muted" />
        <p className="font-sans text-muted text-sm">
          {queue.length === 0
            ? 'No tracks in catalog yet. Run the build script first.'
            : 'Nothing more. Try a different direction.'}
        </p>
        <button onClick={() => router.push('/')} className="text-sm font-sans text-pine underline underline-offset-4">
          Back to home
        </button>
      </div>
    )
  }

  const currentSaveState = saveStates[current.id] ?? 'none'
  const needleSpinning   = fetching || loading           // the needle spins while finding music
  const directionKey     = searchParams.toString()

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <audio
        ref={audioRef}
        preload="auto"
        onEnded={() => stepIndex(1)}
        onPlay={() => { /* state derived from mk + audio.paused */ }}
      />

      <main className="h-dvh overflow-hidden bg-sand select-none">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-20 flex justify-between items-center px-6 pt-6 pt-safe">
          <button
            onClick={() => router.push('/')}
            className="font-serif text-base opacity-50 hover:opacity-100 transition-opacity duration-200"
          >
            JamNet
          </button>
          <div className="flex items-center gap-5">
            <button
              onClick={() => setPanelOpen(true)}
              className="group flex items-center justify-center p-1 -m-1"
              aria-label="Compass — change direction"
            >
              <CompassIcon
                spinning={needleSpinning}
                bearing={bearingFor(current.macroArea)}
                nudge={directionKey}
                size={24}
                className="text-ink opacity-60 group-hover:opacity-100 transition-opacity duration-200"
              />
            </button>
            <button
              onClick={() => router.push('/library')}
              className="opacity-40 hover:opacity-100 transition-opacity duration-200"
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
        </div>

        {/* Track card + controls */}
        <div className="h-full flex flex-col items-center justify-between px-6 pt-20 pb-8 pb-safe">
          <TrackCard
            track={current}
            usingPreview={usingPreview}
            scrubbing={scrubbing}
            onArtistTap={openArtistCard}
            onCountryTap={handleCountryTap}
            onAreaTap={handleAreaTap}
            onYearTap={handleYearTap}
          />

          <PlayerControls
            isPlaying={isPlaying}
            saveState={currentSaveState}
            onSaveToGenre={handleSaveToGenre}
            onSaveToCompilation={handleSaveToCompilation}
            onShare={shareTrack}
            onTogglePlay={togglePlay}
            onStep={onStep}
            onScrubStart={startScrub}
            onScrubStop={stopScrub}
            onReport={() => setReportOpen(true)}
            reportSent={reportSent}
          />
        </div>

        {/* Toasts: link copied / playback status */}
        <AnimatePresence>
          {(linkCopied || playerError) && (
            <motion.div
              className="absolute bottom-28 inset-x-0 flex justify-center pointer-events-none px-6"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <span className="px-3 py-1.5 rounded-lg bg-ink/80 text-sand text-[12px] font-sans text-center">
                {playerError || 'Link copied'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <CompassPanel
        open={panelOpen}
        initialAreas={areas}
        initialDecades={decades}
        initialNow={nowActive}
        fetching={fetching}
        directionKey={directionKey}
        onClose={() => setPanelOpen(false)}
        onGo={(a, d, n) => { setPanelOpen(false); goWithFilters({ areas: a, decades: d, now: n }) }}
        onHome={() => router.push('/')}
      />

      <ArtistSheet
        open={artistOpen}
        fallbackName={current.artist}
        fallbackCountry={current.country}
        fallbackArea={current.macroArea}
        info={artistInfo}
        loading={artistLoading}
        onClose={() => setArtistOpen(false)}
        onListenMore={listenToArtist}
      />

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onReport={sendReport}
      />
    </>
  )
}

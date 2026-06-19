'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import CompassIcon from '@/components/CompassIcon'
import HeartButton, { SaveState } from '@/components/HeartButton'
import WorldMap from '@/components/WorldMap'
import DecadeButtons, { DECADES } from '@/components/DecadeButtons'
import ModeSelector from '@/components/ModeSelector'
import { Track, FlowMode } from '@/lib/types'
import { isInGenrePlaylist, addToGenrePlaylist, isInAnyCompilation, addToDefaultCompilation } from '@/lib/saved'
import { addToHistory } from '@/lib/history'

// ── Constants ──────────────────────────────────────────────────────────────

const SEEN_KEY  = 'jamnet_seen'
const REFETCH_THRESHOLD = 3
const MK_CDN    = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js'

// ── Seen-IDs helpers ────────────────────────────────────────────────────────

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

// ── Country display ────────────────────────────────────────────────────────

function countryName(code: string): string {
  if (!code) return ''
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code }
  catch { return code }
}

// ── MusicKit JS types ──────────────────────────────────────────────────────

interface MKInstance {
  isAuthorized: boolean
  playbackState: number
  authorize(): Promise<string>
  setQueue(opts: { song: string }): Promise<void>
  play(): Promise<void>
  pause(): void
  stop(): void
  addEventListener(event: string, handler: () => void): void
  removeEventListener(event: string, handler: () => void): void
}

declare global {
  interface Window {
    MusicKit: {
      configure(config: object): void
      getInstance(): MKInstance
      // playbackState numeric constants
      PlaybackStates: { none: 0; loading: 1; playing: 2; paused: 3; stopped: 4; ended: 5 }
    }
  }
}

// ── URL helpers ─────────────────────────────────────────────────────────────

interface FlowFilters {
  areas?: string[]
  decades?: number[]
  country?: string
  artistMbId?: string
  artistName?: string
  mode?: FlowMode
}

function buildFlowUrl(f: FlowFilters) {
  const p = new URLSearchParams()
  if (f.areas?.length)  p.set('areas',      f.areas.join(','))
  if (f.decades?.length) p.set('decades',   f.decades.join(','))
  if (f.country)         p.set('country',   f.country)
  if (f.artistMbId)      p.set('artist',    f.artistMbId)
  if (f.artistName)      p.set('artistName', f.artistName)
  if (f.mode && f.mode !== 'rotta') p.set('mode', f.mode)
  const str = p.toString()
  return `/flow${str ? `?${str}` : ''}`
}

function getSaveState(id: string): SaveState {
  if (!isInGenrePlaylist(id)) return 'none'
  if (isInAnyCompilation(id)) return 'both'
  return 'genre'
}

// ── Artist card data ─────────────────────────────────────────────────────────

interface ArtistInfo {
  name: string
  bioShort: string | null
  country: string | null
  macroArea: string | null
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
  const country       = searchParams.get('country') ?? ''
  const artistMbId    = searchParams.get('artist') ?? ''
  const artistNameParam = searchParams.get('artistName') ?? ''
  const sharedTrackId = searchParams.get('track') ?? ''
  const mode: FlowMode = searchParams.get('mode') === 'vortice' ? 'vortice' : 'rotta'

  // ── State ────────────────────────────────────────────────────────────────

  const [queue,        setQueue]        = useState<Track[]>([])
  const [index,        setIndex]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [fetching,     setFetching]     = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)
  const [isPlaying,    setIsPlaying]    = useState(false)
  const [saveStates,   setSaveStates]   = useState<Record<string, SaveState>>({})
  const [usingPreview, setUsingPreview] = useState(false)  // true when playing iTunes 30s fallback
  const [mkReady,      setMkReady]      = useState(false)

  // Overlays
  const [panelOpen,    setPanelOpen]    = useState(false)
  const [panelAreas,   setPanelAreas]   = useState<string[]>(areas)
  const [panelDecades, setPanelDecades] = useState<number[]>(decades)
  const [panelMode,    setPanelMode]    = useState<FlowMode>(mode)
  const [reportOpen,   setReportOpen]   = useState(false)
  const [reportSent,   setReportSent]   = useState(false)
  const [artistOpen,   setArtistOpen]   = useState(false)
  const [artistInfo,   setArtistInfo]   = useState<ArtistInfo | null>(null)
  const [artistLoading, setArtistLoading] = useState(false)
  const [linkCopied,   setLinkCopied]   = useState(false)

  // ── Refs ─────────────────────────────────────────────────────────────────

  const audioRef         = useRef<HTMLAudioElement>(null)
  const mkRef            = useRef<MKInstance | null>(null)
  const fetchingRef      = useRef(false)
  const filtersRef       = useRef<FlowFilters>({})
  const queueRef         = useRef(queue)
  const indexRef         = useRef(index)
  const hasInteractedRef = useRef(hasInteracted)
  const nextTrackRef     = useRef<(() => void) | null>(null)

  useEffect(() => {
    filtersRef.current = {
      areas, decades, country: country || undefined,
      artistMbId: artistMbId || undefined,
      artistName: artistNameParam || undefined,
      mode,
    }
  })
  useEffect(() => { queueRef.current  = queue   }, [queue])
  useEffect(() => { indexRef.current  = index   }, [index])
  useEffect(() => { hasInteractedRef.current = hasInteracted }, [hasInteracted])

  // ── Load & configure MusicKit JS ─────────────────────────────────────────

  useEffect(() => {
    const configure = () => {
      window.MusicKit.configure({
        developerToken: process.env.NEXT_PUBLIC_APPLE_MUSIC_DEVELOPER_TOKEN,
        app: { name: 'JamNet', build: '1.0.0' },
      })
      mkRef.current = window.MusicKit.getInstance()
      setMkReady(true)
    }

    if (window.MusicKit) {
      configure()
    } else {
      document.addEventListener('musickitloaded', configure, { once: true })
      if (!document.querySelector(`script[src="${MK_CDN}"]`)) {
        const s = document.createElement('script')
        s.src   = MK_CDN
        s.async = true
        document.head.appendChild(s)
      }
    }
  }, [])

  // ── MusicKit playback state listener ─────────────────────────────────────

  useEffect(() => {
    const mk = mkRef.current
    if (!mkReady || !mk) return

    const onChange = () => {
      const s = mk.playbackState
      if      (s === 2) setIsPlaying(true)               // playing
      else if (s === 3 || s === 4 || s === 0) setIsPlaying(false) // paused/stopped/none
      else if (s === 5) nextTrackRef.current?.()          // ended → advance
    }

    mk.addEventListener('playbackStateDidChange', onChange)
    return () => mk.removeEventListener('playbackStateDidChange', onChange)
  }, [mkReady])

  // ── Fetch tracks from Supabase ────────────────────────────────────────────

  const fetchTracks = useCallback(async (append: boolean) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    if (append) setFetching(true)
    else        setLoading(true)

    try {
      const f = filtersRef.current
      const currentTrack = queueRef.current[indexRef.current]
      const body = {
        areas:      f.areas   ?? [],
        decades:    f.decades ?? [],
        country:    f.country    ?? null,
        artistMbId: f.artistMbId ?? null,
        artistName: f.artistName ?? null,
        mode:       f.mode ?? 'rotta',
        currentArea: currentTrack?.macroArea || null,
        exclude:    getSeenIds().slice(-400),
      }
      const res  = await fetch('/api/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
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

  // Initial load
  useEffect(() => {
    let cancelled = false
    const load = async () => {
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

  // Sync panel with params on open
  useEffect(() => {
    if (panelOpen) {
      const f = filtersRef.current
      setPanelAreas(f.areas ?? [])
      setPanelDecades(f.decades ?? [])
      setPanelMode(f.mode ?? 'rotta')
    }
  }, [panelOpen])

  // ── Current track ─────────────────────────────────────────────────────────

  const current = queue[index]

  // Prefetch
  useEffect(() => {
    if (!current) return
    const remaining = queue.length - index
    if (remaining < REFETCH_THRESHOLD && !fetching && !loading) fetchTracks(true)
  }, [index, queue.length, current, fetching, loading, fetchTracks])

  // History
  useEffect(() => {
    if (current) addToHistory(current)
  }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── React to current track changes ───────────────────────────────────────
  // Only stop/reset state here. Actual MusicKit authorize+setQueue+play
  // happens in togglePlay so it always runs from a user gesture (iOS requirement).

  useEffect(() => {
    if (!current) return

    // Stop current playback
    if (mkRef.current) mkRef.current.stop()
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    setIsPlaying(false)

    if (current.appleMusId) {
      setUsingPreview(false)
      // If already interacted, re-trigger play via togglePlay equivalent
      if (hasInteractedRef.current && mkRef.current) {
        const mk = mkRef.current
        const resume = async () => {
          if (!mk.isAuthorized) await mk.authorize()
          await mk.setQueue({ song: current.appleMusId! })
          await mk.play()
        }
        resume().catch(() => {
          if (current.previewUrl && audioRef.current) {
            setUsingPreview(true)
            audioRef.current.src = current.previewUrl
            audioRef.current.play().catch(() => {})
          }
        })
      }
    } else if (current.previewUrl) {
      setUsingPreview(true)
      if (audioRef.current) {
        audioRef.current.src = current.previewUrl
        if (hasInteractedRef.current) audioRef.current.play().catch(() => {})
      }
    } else {
      setIndex(i => Math.min(i + 1, queueRef.current.length - 1))
    }
  }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation / playback controls ───────────────────────────────────────

  const nextTrack = useCallback(() => {
    setHasInteracted(true)
    setIndex(i => {
      const q = queueRef.current
      let next = i + 1
      if (!filtersRef.current.artistMbId && !filtersRef.current.artistName &&
          next < q.length && q[next]?.artist === q[i]?.artist && next + 1 < q.length) {
        next = next + 1
      }
      return Math.min(next, q.length - 1)
    })
    setReportSent(false)
  }, [])

  nextTrackRef.current = nextTrack

  const togglePlay = () => {
    if (!current) return
    setHasInteracted(true)

    if (current.appleMusId && mkRef.current) {
      const mk = mkRef.current
      if (mk.playbackState === 2) {
        mk.pause()
      } else {
        const startPlay = async () => {
          // authorize (user gesture is active here — safe on iOS)
          if (!mk.isAuthorized) await mk.authorize()
          // always set queue so the correct track is loaded
          await mk.setQueue({ song: current.appleMusId! })
          await mk.play()
        }
        startPlay().catch(() => {
          // MusicKit failed — fall back to preview
          if (current.previewUrl && audioRef.current) {
            setUsingPreview(true)
            audioRef.current.src = current.previewUrl
            audioRef.current.play().catch(() => {})
          }
        })
      }
    } else if (current.previewUrl && audioRef.current) {
      if (audioRef.current.paused) audioRef.current.play().catch(() => {})
      else audioRef.current.pause()
    }
  }

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
    goWithFilters({ areas: [area], decades: f.decades, mode: f.mode })
  }

  const handleCountryTap = (code: string) => {
    const f = filtersRef.current
    goWithFilters({ country: code, decades: f.decades, mode: f.mode })
  }

  const handleYearTap = (year: number) => {
    if (!year) return
    const decade = Math.min(2020, Math.max(1950, Math.floor(year / 10) * 10))
    const f = filtersRef.current
    goWithFilters({ areas: f.areas, country: f.country, decades: [decade], mode: f.mode })
  }

  const openArtistCard = async () => {
    if (!current) return
    setArtistOpen(true)
    setArtistLoading(true)
    setArtistInfo(null)
    try {
      const q   = current.artist_mb_id
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

  const sendReport = async (motivo: 'wrong_video' | 'wrong_metadata') => {
    if (!current || reportSent) return
    setReportOpen(false)
    setReportSent(true)
    try {
      await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: current.id, motivo }),
      })
    } catch { /* silent */ }
  }

  // ── Panel helpers ─────────────────────────────────────────────────────────

  const togglePanelArea = (area: string) => {
    setPanelAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area])
  }

  const togglePanelDecade = (d: number) => {
    setPanelDecades(prev => {
      if (prev.length === 0) return [d]
      const next = prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
      return next.length === 0 || next.length === DECADES.length ? [] : next
    })
  }

  const goPanel = () => {
    setPanelOpen(false)
    goWithFilters({ areas: panelAreas, decades: panelDecades, mode: panelMode })
  }

  // ── Loading / empty states ────────────────────────────────────────────────

  if (loading && queue.length === 0) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-ivory gap-4">
        <CompassIcon spinning size={48} className="text-ink" />
        <p className="text-sm font-sans text-muted">Finding music…</p>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-ivory gap-6 px-8 text-center">
        <CompassIcon size={36} className="text-muted" />
        <p className="font-sans text-muted text-sm">
          {queue.length === 0
            ? 'No tracks in catalog yet. Run the build script first.'
            : 'Nothing more. Try a different direction.'}
        </p>
        <button onClick={() => router.push('/')} className="text-sm font-sans text-terracotta underline underline-offset-4">
          Back to home
        </button>
      </div>
    )
  }

  const currentSaveState = saveStates[current.id] ?? 'none'
  const displayCountry   = countryName(current.country)
  const needleSpinning   = mode === 'vortice' && (fetching || loading)
  const directionKey     = searchParams.toString()

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* iTunes preview fallback audio element */}
      <audio
        ref={audioRef}
        preload="auto"
        onEnded={nextTrack}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      <main className="h-dvh overflow-hidden bg-ivory select-none">
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

        {/* Track card */}
        <div className="h-full flex flex-col items-center justify-between px-6 pt-20 pb-8 pb-safe">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              className="w-full flex-1 flex flex-col items-center justify-center gap-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              {/* Album art */}
              <div className="w-full max-w-xs aspect-square rounded-xl overflow-hidden bg-parchment border border-border relative">
                {current.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={current.artworkUrl} alt="" className="w-full h-full object-cover" draggable={false} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <CompassIcon size={48} className="text-muted/40" />
                  </div>
                )}
                {usingPreview && (
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-ink/60 text-ivory text-[10px] font-sans tracking-wide">
                    preview
                  </div>
                )}
              </div>

              {/* Track info */}
              <div className="w-full max-w-xs flex flex-col gap-1">
                <h1 className="font-serif text-[1.6rem] leading-tight">{current.title}</h1>
                <button
                  onClick={openArtistCard}
                  className="self-start text-base font-sans opacity-65 hover:opacity-100 hover:text-terracotta transition-colors duration-200 text-left"
                >
                  {current.artist}
                </button>
                <div className="flex flex-wrap items-center gap-2 text-[13px] font-sans text-muted">
                  {displayCountry && (
                    <button onClick={() => handleCountryTap(current.country)} className="hover:text-terracotta transition-colors duration-200">
                      {displayCountry}
                    </button>
                  )}
                  {displayCountry && current.macroArea && <span className="opacity-40">·</span>}
                  {current.macroArea && (
                    <button onClick={() => handleAreaTap(current.macroArea)} className="hover:text-terracotta transition-colors duration-200">
                      {current.macroArea}
                    </button>
                  )}
                  {Boolean(current.year) && (
                    <>
                      <span className="opacity-40">·</span>
                      <button onClick={() => handleYearTap(current.year)} className="hover:text-terracotta transition-colors duration-200 tabular-nums">
                        {current.year}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Controls: heart · share · play/pause · skip · report */}
          <div className="w-full max-w-xs flex items-center justify-between pt-4">
            <HeartButton
              saveState={currentSaveState}
              onSaveToGenre={handleSaveToGenre}
              onSaveToCompilation={handleSaveToCompilation}
              size={24}
            />

            <button onClick={shareTrack} className="p-2 -m-2 opacity-40 hover:opacity-100 transition-opacity duration-200" aria-label="Share this track">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" strokeLinecap="round" />
                <path d="M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <button
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-14 h-14 flex items-center justify-center rounded-full bg-terracotta text-ivory hover:opacity-90 active:scale-95 transition-all duration-200"
            >
              {isPlaying ? (
                <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
                  <rect x="3" y="2.5" width="3.4" height="11" rx="1" />
                  <rect x="9.6" y="2.5" width="3.4" height="11" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
                  <path d="M4 2.5l9.5 5.5L4 13.5V2.5z" />
                </svg>
              )}
            </button>

            <button onClick={nextTrack} className="p-2 -m-2 opacity-40 hover:opacity-100 transition-opacity duration-200" aria-label="Skip to next track">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M5 4.5l10 7.5-10 7.5V4.5z" />
                <rect x="17" y="4.5" width="2" height="15" rx="1" />
              </svg>
            </button>

            <button
              onClick={() => { if (!reportSent) setReportOpen(true) }}
              className={`p-2 -m-2 transition-opacity duration-200 ${reportSent ? 'opacity-20 pointer-events-none' : 'opacity-30 hover:opacity-70'}`}
              aria-label="Report wrong match"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinejoin="round" />
                <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
                <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* "Link copied" toast */}
        <AnimatePresence>
          {linkCopied && (
            <motion.div
              className="absolute bottom-28 inset-x-0 flex justify-center pointer-events-none"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <span className="px-3 py-1.5 rounded-lg bg-ink/80 text-ivory text-[12px] font-sans">Link copied</span>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Compass panel ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col justify-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={() => setPanelOpen(false)} />
            <motion.div
              className="relative bg-ivory rounded-t-2xl px-6 pt-7 pb-10 pb-safe max-h-[88dvh] overflow-y-auto"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col gap-6 max-w-md mx-auto">
                <div className="flex items-center gap-3">
                  <CompassIcon size={20} spinning={panelMode === 'vortice' && fetching} nudge={directionKey} className="text-ink" />
                  <span className="text-sm font-sans text-muted">New direction</span>
                </div>
                <div className="flex flex-col gap-2">
                  <WorldMap selected={panelAreas} onToggle={togglePanelArea} className="w-full" />
                  <div className="flex justify-center">
                    <button
                      onClick={() => setPanelAreas([])}
                      aria-pressed={panelAreas.length === 0}
                      className={`px-4 py-1.5 rounded-full text-[13px] font-sans border transition-colors duration-200 ${
                        panelAreas.length === 0 ? 'bg-terracotta border-terracotta text-ivory' : 'border-border text-muted'
                      }`}
                    >
                      Whole world
                    </button>
                  </div>
                </div>
                <DecadeButtons selected={panelDecades} onToggle={togglePanelDecade} />
                <ModeSelector mode={panelMode} onChange={setPanelMode} />
                <div className="flex justify-between items-center">
                  <button onClick={() => router.push('/')} className="text-sm font-sans text-muted hover:text-terracotta transition-colors duration-200">
                    Back to home
                  </button>
                  <button onClick={goPanel} className="px-6 py-2.5 bg-terracotta text-ivory rounded-full text-sm font-sans hover:opacity-90 transition-opacity duration-200">
                    Go
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Artist card ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {artistOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={() => setArtistOpen(false)} />
            <motion.div
              className="relative bg-ivory rounded-t-2xl w-full max-w-md px-6 pt-7 pb-10 pb-safe"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            >
              <h2 className="font-serif text-xl mb-1">{current.artist}</h2>
              {artistInfo?.country || current.country ? (
                <p className="text-[12px] font-sans text-muted mb-4">
                  {countryName(artistInfo?.country || current.country)}
                  {current.macroArea ? ` · ${current.macroArea}` : ''}
                </p>
              ) : <div className="mb-4" />}
              {artistLoading ? (
                <p className="text-[14px] font-sans text-muted mb-6">…</p>
              ) : artistInfo?.bioShort ? (
                <p className="text-[14px] font-sans leading-relaxed opacity-80 mb-6">{artistInfo.bioShort}</p>
              ) : (
                <p className="text-[14px] font-sans text-muted mb-6">No notes on this artist yet.</p>
              )}
              <button onClick={listenToArtist} className="w-full px-4 py-3 rounded-xl border border-terracotta text-terracotta text-[14px] font-sans hover:bg-terracotta hover:text-ivory transition-colors duration-200">
                Listen to more by this artist
              </button>
              <button onClick={() => setArtistOpen(false)} className="mt-4 text-sm font-sans text-muted hover:text-terracotta transition-colors duration-200">
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Report overlay ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {reportOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={() => setReportOpen(false)} />
            <motion.div
              className="relative bg-ivory rounded-t-2xl w-full max-w-md px-6 pt-7 pb-10 pb-safe"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            >
              <p className="text-sm font-sans text-muted mb-5">What seems wrong?</p>
              <div className="flex flex-col gap-3">
                <button onClick={() => sendReport('wrong_video')} className="w-full text-left px-4 py-3 rounded-xl border border-border text-[14px] font-sans hover:border-terracotta hover:text-terracotta transition-colors duration-200">
                  Wrong audio — this track doesn&apos;t match
                </button>
                <button onClick={() => sendReport('wrong_metadata')} className="w-full text-left px-4 py-3 rounded-xl border border-border text-[14px] font-sans hover:border-terracotta hover:text-terracotta transition-colors duration-200">
                  Wrong metadata — title, artist or year is incorrect
                </button>
              </div>
              <button onClick={() => setReportOpen(false)} className="mt-5 text-sm font-sans text-muted hover:text-terracotta transition-colors duration-200">
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

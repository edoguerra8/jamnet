'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import CompassIcon from '@/components/ui/CompassIcon'
import { SaveState } from '@/components/ui/HeartButton'
import TrackCard from '@/components/flow/TrackCard'
import TrailThread, { TrailItem } from '@/components/flow/TrailThread'
import SeekBar from '@/components/flow/SeekBar'
import PlayerControls from '@/components/flow/PlayerControls'
import CompassPanel from '@/components/flow/CompassPanel'
import ArtistSheet, { ArtistInfo } from '@/components/flow/ArtistSheet'
import ReportSheet, { ReportReason } from '@/components/flow/ReportSheet'
import { DECADES } from '@/components/controls/DecadeButtons'
import { Track } from '@/lib/types'
import { isInGenrePlaylist, addToGenrePlaylist, isInAnyCompilation, addToDefaultCompilation } from '@/lib/storage/saved'
import { addToHistory } from '@/lib/storage/history'
import { useMusicKit } from '@/lib/player/useMusicKit'
import { bearingFor, countryName } from '@/lib/geo'

// ── Constants ──────────────────────────────────────────────────────────────

const SEEN_KEY = 'jamnet_seen'
const PLAY_QUEUE_KEY = 'jamnet_play_queue'   // sessionStorage handoff for sequence playback
const REFETCH_THRESHOLD = 3
const SCAN_TICK_MS = 240   // within-track scan tick

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
  now?: boolean
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
  const decades = decadesParam ? decadesParam.split(',').map(Number).filter(d => DECADES.includes(d)) : []
  const nowActive = decadesParam.split(',').includes('now')
  const country         = searchParams.get('country') ?? ''
  const artistMbId      = searchParams.get('artist') ?? ''
  const artistNameParam = searchParams.get('artistName') ?? ''
  const sharedTrackId   = searchParams.get('track') ?? ''
  const listMode        = searchParams.get('source') === 'list'

  // ── State ────────────────────────────────────────────────────────────────

  const [queue,        setQueue]        = useState<Track[]>([])
  const [index,        setIndex]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [fetching,     setFetching]     = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)
  const [saveStates,   setSaveStates]   = useState<Record<string, SaveState>>({})
  const [usingPreview, setUsingPreview] = useState(false)
  const [playerError,  setPlayerError]  = useState<string | null>(null)
  const [audioPos,     setAudioPos]     = useState(0)   // preview <audio> progress
  const [audioDur,     setAudioDur]     = useState(0)
  const [audioPlaying, setAudioPlaying] = useState(false)

  // Overlays
  const [panelOpen,    setPanelOpen]    = useState(false)
  const [reportOpen,   setReportOpen]   = useState(false)
  const [reportSent,   setReportSent]   = useState(false)
  const [artistOpen,   setArtistOpen]   = useState(false)
  const [artistInfo,   setArtistInfo]   = useState<ArtistInfo | null>(null)
  const [artistLoading, setArtistLoading] = useState(false)
  const [linkCopied,   setLinkCopied]   = useState(false)

  // ── Refs ─────────────────────────────────────────────────────────────────

  const audioRef         = useRef<HTMLAudioElement>(null)
  const fetchingRef      = useRef(false)
  const filtersRef       = useRef<FlowFilters>({})
  const queueRef         = useRef(queue)
  const indexRef         = useRef(index)
  const hasInteractedRef = useRef(hasInteracted)
  const usingPreviewRef  = useRef(usingPreview)
  const loadedIdRef      = useRef<string | null>(null)
  const settleRef        = useRef<(() => void) | null>(null)
  const scanDirRef       = useRef<1 | -1 | null>(null)
  const scanTimerRef     = useRef<number | null>(null)
  const scanStepRef      = useRef(3)

  useEffect(() => {
    filtersRef.current = {
      areas, decades, now: nowActive, country: country || undefined,
      artistMbId: artistMbId || undefined, artistName: artistNameParam || undefined,
    }
  })
  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { indexRef.current = index }, [index])
  useEffect(() => { hasInteractedRef.current = hasInteracted }, [hasInteracted])
  useEffect(() => { usingPreviewRef.current = usingPreview }, [usingPreview])

  const current = queue[index]

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
      if (audio) { audio.pause(); audio.src = '' }
      if (mk.ready) {
        setUsingPreview(false)
        if (!hasInteractedRef.current) { loadedIdRef.current = null; return }
        loadedIdRef.current = cur.appleMusId
        mk.playSong(cur.appleMusId).catch((e) => {
          console.error('[play] playSong failed:', e)
          loadedIdRef.current = null
          if (cur.previewUrl && audio) {
            setUsingPreview(true); audio.src = cur.previewUrl; audio.play().catch(() => {})
          } else flashError(playErrorMessage(e))
        })
      } else if (cur.previewUrl && audio) {
        setUsingPreview(true); audio.src = cur.previewUrl
        if (hasInteractedRef.current) audio.play().catch(() => {})
      } else {
        setUsingPreview(false)
      }
    } else if (cur.previewUrl) {
      mk.stop(); loadedIdRef.current = null; setUsingPreview(true)
      if (audio) { audio.src = cur.previewUrl; if (hasInteractedRef.current) audio.play().catch(() => {}) }
    } else {
      stepIndex(1)
    }
  }, [mk, stepIndex, flashError])

  const settle = useCallback(() => {
    const cur = queueRef.current[indexRef.current]
    if (!cur) return
    setReportSent(false)
    addToHistory(cur)
    loadCurrent()
  }, [loadCurrent])

  useEffect(() => { settleRef.current = settle })

  // ── Fetch tracks ────────────────────────────────────────────────────────

  const fetchTracks = useCallback(async (append: boolean) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    if (append) setFetching(true); else setLoading(true)
    try {
      const f = filtersRef.current
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
        setQueue(newTracks); setIndex(0); setSaveStates(newStates)
      }
    } catch { /* silent */ }
    finally { setLoading(false); setFetching(false); fetchingRef.current = false }
  }, [])

  // Initial load (list handoff, shared track, or a fresh fetch)
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
        } catch { /* fall through */ }
      }
      if (sharedTrackId) {
        setLoading(true)
        try {
          const res  = await fetch(`/api/track?id=${encodeURIComponent(sharedTrackId)}`)
          const data = await res.json()
          if (!cancelled && data.track) {
            addSeenId(data.track.id)
            setQueue([data.track]); setIndex(0); setSaveStates({ [data.track.id]: getSaveState(data.track.id) }); setLoading(false)
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

  // Prefetch more when the queue runs low (skipped in list mode)
  useEffect(() => {
    if (!current || listMode) return
    const remaining = queue.length - index
    if (remaining < REFETCH_THRESHOLD && !fetching && !loading) fetchTracks(true)
  }, [index, queue.length, current, fetching, loading, fetchTracks, listMode])

  // React to the settled current track
  useEffect(() => {
    if (!current) return
    settleRef.current?.()
  }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // If play was pressed before MusicKit finished loading, start once it's ready
  useEffect(() => {
    if (mk.ready && hasInteractedRef.current && !loadedIdRef.current) settleRef.current?.()
  }, [mk.ready])

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
          setUsingPreview(true); audioRef.current.src = cur.previewUrl; audioRef.current.play().catch(() => {})
        } else flashError(playErrorMessage(e))
      })
    } else if (cur.appleMusId && !mk.ready) {
      flashError('Connecting to Apple Music…')
    } else if (cur.previewUrl && audioRef.current) {
      if (audioRef.current.paused) audioRef.current.play().catch(() => {}); else audioRef.current.pause()
    } else {
      flashError('This track isn’t playable')
    }
  }, [mk, flashError])

  const isPlaying = mk.isPlaying || (usingPreview && audioPlaying)

  // ── Seek + within-track scan (⏪ ⏩) ─────────────────────────────────────────

  const livePos = () => usingPreviewRef.current ? (audioRef.current?.currentTime || 0) : (mk.instance()?.currentPlaybackTime ?? 0)
  const liveDur = () => usingPreviewRef.current ? (audioRef.current?.duration || 0) : (mk.instance()?.currentPlaybackDuration ?? 0)

  const seek = useCallback((t: number) => {
    const target = Math.max(0, t)
    if (usingPreviewRef.current) { if (audioRef.current) audioRef.current.currentTime = target }
    else mk.seekTo(target)
  }, [mk])

  const onScanTap = useCallback((dir: 1 | -1) => {
    const d = liveDur()
    const next = Math.max(0, d > 0 ? Math.min(d, livePos() + dir * 15) : livePos() + dir * 15)
    seek(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seek])

  const scanTick = useCallback(() => {
    const dir = scanDirRef.current
    if (!dir) return
    const d = liveDur()
    const next = Math.max(0, d > 0 ? Math.min(d, livePos() + dir * scanStepRef.current) : livePos() + dir * scanStepRef.current)
    seek(next)
    scanStepRef.current = Math.min(20, scanStepRef.current * 1.4)
    scanTimerRef.current = window.setTimeout(scanTick, SCAN_TICK_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seek])

  const startScan = useCallback((dir: 1 | -1) => {
    scanDirRef.current = dir
    scanStepRef.current = 3
    scanTick()
  }, [scanTick])

  const stopScan = useCallback(() => {
    if (scanTimerRef.current) { clearTimeout(scanTimerRef.current); scanTimerRef.current = null }
    scanDirRef.current = null
  }, [])

  useEffect(() => () => { if (scanTimerRef.current) clearTimeout(scanTimerRef.current) }, [])

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

  // ── Taps on the track card ────────────────────────────────────────────────

  const goWithFilters = (f: FlowFilters) => router.push(buildFlowUrl(f))
  const handleAreaTap = (area: string) => { const f = filtersRef.current; goWithFilters({ areas: [area], decades: f.decades }) }
  const handleCountryTap = (code: string) => { const f = filtersRef.current; goWithFilters({ country: code, decades: f.decades }) }
  const handleYearTap = (year: number) => {
    if (!year) return
    const decade = Math.min(2020, Math.max(1950, Math.floor(year / 10) * 10))
    const f = filtersRef.current
    goWithFilters({ areas: f.areas, country: f.country, decades: [decade] })
  }

  const openArtistCard = async () => {
    if (!current) return
    setArtistOpen(true); setArtistLoading(true); setArtistInfo(null)
    try {
      const q = current.artist_mb_id ? `mbId=${encodeURIComponent(current.artist_mb_id)}` : `name=${encodeURIComponent(current.artist)}`
      const res  = await fetch(`/api/artist?${q}`)
      const data = await res.json()
      setArtistInfo(data.artist
        ? { name: data.artist.name, bioShort: data.artist.bioShort, country: data.artist.country, macroArea: data.artist.macroArea }
        : { name: current.artist, bioShort: null, country: null, macroArea: null })
    } catch {
      setArtistInfo({ name: current.artist, bioShort: null, country: null, macroArea: null })
    } finally { setArtistLoading(false) }
  }

  const listenToArtist = () => {
    if (!current) return
    setArtistOpen(false)
    goWithFilters(current.artist_mb_id ? { artistMbId: current.artist_mb_id, artistName: current.artist } : { artistName: current.artist })
  }

  const shareTrack = async () => {
    if (!current) return
    const url = `${window.location.origin}/flow?track=${current.id}`
    try { if (navigator.share) { await navigator.share({ title: `${current.title} — ${current.artist}`, url }); return } } catch { return }
    try { await navigator.clipboard.writeText(url); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) } catch {}
  }

  const sendReport = async (reason: ReportReason) => {
    if (!current || reportSent) return
    setReportOpen(false); setReportSent(true)
    try {
      await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ track_id: current.id, motivo: reason }) })
    } catch { /* silent */ }
  }

  // ── Loading / empty ─────────────────────────────────────────────────────────

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
          {queue.length === 0 ? 'No tracks in catalog yet. Run the build script first.' : 'Nothing more. Try a different direction.'}
        </p>
        <button onClick={() => router.push('/')} className="text-sm font-sans text-pine underline underline-offset-4">Back to home</button>
      </div>
    )
  }

  const currentSaveState = saveStates[current.id] ?? 'none'
  const needleSpinning   = fetching || loading
  const directionKey     = searchParams.toString()
  const position = usingPreview ? audioPos : mk.position
  const duration = usingPreview ? audioDur : mk.duration

  // Trail — last few tracks of the journey, current highlighted
  const trailStart = Math.max(0, index - 3)
  const trailItems: TrailItem[] = queue.slice(trailStart, index + 1).map((t, i) => ({
    id: `${t.id}:${trailStart + i}`,
    label: `${countryName(t.country) || t.country || '—'} '${t.year ? String(t.year).slice(2) : '··'}`,
    current: trailStart + i === index,
  }))

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <audio
        ref={audioRef}
        preload="auto"
        onEnded={() => stepIndex(1)}
        onPlay={() => setAudioPlaying(true)}
        onPause={() => setAudioPlaying(false)}
        onTimeUpdate={() => setAudioPos(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setAudioDur(audioRef.current?.duration || 0)}
      />

      <main className="h-dvh overflow-hidden bg-sand text-ink select-none flex flex-col px-6 pt-safe pb-safe">
        <div className="w-full max-w-md mx-auto flex-1 flex flex-col min-h-0 pt-12 pb-2">

          {/* Top bar */}
          <div className="flex justify-between items-center mb-[18px] shrink-0">
            <button onClick={() => router.push('/')} className="font-serif text-[17px] opacity-60 hover:opacity-100 transition-opacity duration-200">JamNet</button>
            <div className="flex items-center gap-[18px]">
              <button onClick={() => setPanelOpen(true)} className="p-1 -m-1" aria-label="Compass — change direction">
                <CompassIcon spinning={needleSpinning} bearing={bearingFor(current.macroArea)} nudge={directionKey} size={24} className="text-ink" />
              </button>
              <button onClick={() => router.push('/library')} className="text-ink/40 hover:text-ink transition-colors duration-200" aria-label="Library">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 19V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13" strokeLinecap="round" />
                  <path d="M4 19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2" /><line x1="9" y1="8" x2="15" y2="8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Trail */}
          <div className="mb-6 shrink-0"><TrailThread items={trailItems} /></div>

          {/* Track card — lives in a flex-1 zone that absorbs height variation so the
              controls below never shift between tracks */}
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden">
            <TrackCard
              track={current}
              usingPreview={usingPreview}
              onArtistTap={openArtistCard}
              onCountryTap={handleCountryTap}
              onAreaTap={handleAreaTap}
              onYearTap={handleYearTap}
            />
          </div>

          {/* Seek + transport + utility — fixed-height footer, never moves */}
          <div className="w-full max-w-[280px] mx-auto flex flex-col gap-[18px] mt-5 shrink-0">
            <SeekBar position={position} duration={duration} onSeek={seek} disabled={duration <= 0} />
            <PlayerControls
              isPlaying={isPlaying}
              onTogglePlay={togglePlay}
              onPrevTrack={() => { setHasInteracted(true); hasInteractedRef.current = true; stepIndex(-1) }}
              onNextTrack={() => { setHasInteracted(true); hasInteractedRef.current = true; stepIndex(1) }}
              onScanTap={onScanTap}
              onScanStart={startScan}
              onScanStop={stopScan}
              saveState={currentSaveState}
              onSaveToGenre={handleSaveToGenre}
              onSaveToCompilation={handleSaveToCompilation}
              onShare={shareTrack}
              onReport={() => setReportOpen(true)}
              reportSent={reportSent}
            />
          </div>
        </div>

        {/* Toasts */}
        <AnimatePresence>
          {(linkCopied || playerError) && (
            <motion.div className="absolute bottom-28 inset-x-0 flex justify-center pointer-events-none px-6"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <span className="px-3 py-1.5 rounded-lg bg-ink/80 text-sand text-[12px] font-sans text-center">{playerError || 'Link copied'}</span>
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

      <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} onReport={sendReport} />
    </>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import PlaylistCover from '@/components/library/PlaylistCover'
import CompassIcon from '@/components/ui/CompassIcon'
import ShareSheet from '@/components/library/ShareSheet'
import {
  getGenrePlaylists, getCompilations, createCompilation,
  renameCompilation, removeCompilation,
  removeTrackFromCompilation, removeFromGenrePlaylist, moveTrackInCompilation,
} from '@/lib/storage/saved'
import { getHistory } from '@/lib/storage/history'
import { Track, Compilation, HistoryEntry } from '@/lib/types'

const PLAY_QUEUE_KEY = 'jamnet_play_queue'

export default function LibraryPage() {
  const router = useRouter()
  const [genrePlaylists, setGenrePlaylists] = useState<Record<string, Track[]>>({})
  const [compilations, setCompilations] = useState<Compilation[]>([])
  const [recent, setRecent] = useState<HistoryEntry[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [sharing, setSharing] = useState<{ name: string; tracks: Track[] } | null>(null)

  const reload = () => {
    setGenrePlaylists(getGenrePlaylists())
    setCompilations(getCompilations())
    setRecent(getHistory().slice(0, 25))
  }

  useEffect(() => { reload() }, [])

  const genres = Object.keys(genrePlaylists).sort()
  const empty = genres.length === 0 && compilations.length === 0 && recent.length === 0

  // Play a list in sequence — hand the tracks to the flow via sessionStorage.
  const playList = (tracks: Track[]) => {
    if (!tracks.length) return
    try { sessionStorage.setItem(PLAY_QUEUE_KEY, JSON.stringify(tracks)) } catch {}
    router.push('/flow?source=list')
  }
  const playTrack = (id: string) => router.push(`/flow?track=${id}`)

  const handleNewCompilation = () => { createCompilation('Compilation'); reload() }
  const handleRenameStart = (comp: Compilation) => { setRenamingId(comp.id); setRenameValue(comp.name) }
  const handleRenameCommit = () => {
    if (renamingId && renameValue.trim()) renameCompilation(renamingId, renameValue.trim())
    setRenamingId(null); setRenameValue(''); reload()
  }
  const handleRemoveCompilation = (id: string) => {
    removeCompilation(id); if (expanded === id) setExpanded(null); reload()
  }
  const handleRemoveFromGenre = (trackId: string, genre: string) => { removeFromGenrePlaylist(trackId, genre); reload() }
  const handleRemoveFromCompilation = (trackId: string, compId: string) => { removeTrackFromCompilation(trackId, compId); reload() }
  const handleMove = (compId: string, trackId: string, dir: -1 | 1) => { moveTrackInCompilation(compId, trackId, dir); reload() }

  const PlayIcon = () => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4 2.5l9.5 5.5L4 13.5V2.5z" /></svg>
  )
  const ShareIcon = () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" strokeLinecap="round" />
      <path d="M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )

  return (
    <main className="min-h-dvh bg-ivory px-5 pt-safe pb-safe">
      {/* Header */}
      <div className="flex items-center justify-between pt-6 pb-8">
        <button onClick={() => router.back()} className="opacity-50 hover:opacity-100 transition-opacity" aria-label="Back">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="font-serif text-lg tracking-tight">Library</span>
        <div className="w-[22px]" />
      </div>

      {empty ? (
        <div className="flex flex-col items-center justify-center gap-4 pt-20 text-center px-8">
          <CompassIcon size={36} className="text-muted" />
          <p className="text-sm font-sans text-muted">
            Nothing saved yet. Tap the heart while listening to save tracks.
          </p>
          <button onClick={() => router.push('/')} className="text-sm font-sans text-terracotta underline underline-offset-4">
            Start exploring
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-10">

          {/* Recently played */}
          {recent.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-[11px] font-sans text-muted uppercase tracking-widest">Recently played</h2>
              <div className="flex flex-col">
                {recent.map(t => (
                  <button key={`${t.id}-${t.playedAt}`} onClick={() => playTrack(t.id)} className="flex items-center gap-3 py-2 text-left">
                    {t.artworkUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.artworkUrl} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
                    ) : <div className="w-9 h-9 rounded bg-parchment shrink-0" />}
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-[13px] font-sans truncate">{t.title}</span>
                      <span className="text-[11px] font-sans text-muted truncate">{t.artist}{t.year ? ` · ${t.year}` : ''}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Genre playlists */}
          {genres.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-[11px] font-sans text-muted uppercase tracking-widest">Genre playlists</h2>
              <div className="flex flex-col gap-2">
                {genres.map(genre => {
                  const tracks = genrePlaylists[genre]
                  const isOpen = expanded === `genre-${genre}`
                  return (
                    <div key={genre} className="flex flex-col">
                      <div className="flex items-center gap-3 py-3">
                        <button className="flex items-center gap-4 flex-1 text-left min-w-0" onClick={() => setExpanded(isOpen ? null : `genre-${genre}`)}>
                          <PlaylistCover genre={genre} className="w-12 h-12 shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="font-sans text-[15px] truncate">{genre}</span>
                            <span className="text-[12px] font-sans text-muted">{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</span>
                          </div>
                        </button>
                        <button onClick={() => playList(tracks)} className="p-2 text-terracotta opacity-80 hover:opacity-100 transition-opacity" aria-label="Play in sequence"><PlayIcon /></button>
                        <button onClick={() => setSharing({ name: genre, tracks })} className="p-2 opacity-40 hover:opacity-100 transition-opacity" aria-label="Save or share"><ShareIcon /></button>
                      </div>

                      <AnimatePresence>
                        {isOpen && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden pl-16">
                            <div className="flex flex-col gap-0 pb-2">
                              {tracks.map(t => (
                                <div key={t.id} className="flex items-center gap-3 py-2.5">
                                  {t.artworkUrl && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={t.artworkUrl} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
                                  )}
                                  <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-[13px] font-sans truncate">{t.title}</span>
                                    <span className="text-[11px] font-sans text-muted truncate">{t.artist} · {t.year}</span>
                                  </div>
                                  <button onClick={() => handleRemoveFromGenre(t.id, genre)} className="p-1.5 opacity-30 hover:opacity-80 transition-opacity shrink-0" aria-label="Remove">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
                                  </button>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Compilations */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-sans text-muted uppercase tracking-widest">Compilations</h2>
              <button onClick={handleNewCompilation} className="text-[12px] font-sans text-terracotta flex items-center gap-1">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
                New
              </button>
            </div>

            {compilations.length === 0 ? (
              <p className="text-[13px] font-sans text-muted">Tap the bookmark icon in the flow to add tracks to a compilation.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {compilations.map(comp => {
                  const isOpen = expanded === `comp-${comp.id}`
                  return (
                    <div key={comp.id} className="flex flex-col">
                      <div className="flex items-center gap-2 py-3 w-full">
                        <button className="flex items-center gap-4 flex-1 text-left min-w-0" onClick={() => setExpanded(isOpen ? null : `comp-${comp.id}`)}>
                          <PlaylistCover genre="Compilation" className="w-12 h-12 shrink-0" />
                          <div className="flex flex-col flex-1 min-w-0">
                            {renamingId === comp.id ? (
                              <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={handleRenameCommit}
                                onKeyDown={e => { if (e.key === 'Enter') handleRenameCommit() }} onClick={e => e.stopPropagation()}
                                className="font-sans text-[15px] bg-transparent border-b border-terracotta focus:outline-none w-full" />
                            ) : (
                              <span className="font-sans text-[15px] truncate">{comp.name}</span>
                            )}
                            <span className="text-[12px] font-sans text-muted">{comp.tracks.length} {comp.tracks.length === 1 ? 'track' : 'tracks'}</span>
                          </div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => playList(comp.tracks)} className="p-2 text-terracotta opacity-80 hover:opacity-100 transition-opacity" aria-label="Play in sequence"><PlayIcon /></button>
                          <button onClick={() => setSharing({ name: comp.name, tracks: comp.tracks })} className="p-2 opacity-40 hover:opacity-100 transition-opacity" aria-label="Save or share"><ShareIcon /></button>
                          <button onClick={() => handleRenameStart(comp)} className="p-2 opacity-30 hover:opacity-80 transition-opacity" aria-label="Rename">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" strokeLinecap="round" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" /></svg>
                          </button>
                          <button onClick={() => handleRemoveCompilation(comp.id)} className="p-2 opacity-30 hover:opacity-80 transition-opacity" aria-label="Delete compilation">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" strokeLinecap="round" /></svg>
                          </button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {isOpen && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden pl-16">
                            <div className="flex flex-col gap-0 pb-2">
                              {comp.tracks.length === 0 ? (
                                <p className="text-[12px] font-sans text-muted py-2">Empty</p>
                              ) : comp.tracks.map((t, i) => (
                                <div key={t.id} className="flex items-center gap-2 py-2.5">
                                  {t.artworkUrl && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={t.artworkUrl} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
                                  )}
                                  <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-[13px] font-sans truncate">{t.title}</span>
                                    <span className="text-[11px] font-sans text-muted truncate">{t.artist} · {t.year}</span>
                                  </div>
                                  <button onClick={() => handleMove(comp.id, t.id, -1)} disabled={i === 0} className="p-1 opacity-30 hover:opacity-80 disabled:opacity-10 transition-opacity shrink-0" aria-label="Move up">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 15l-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                  </button>
                                  <button onClick={() => handleMove(comp.id, t.id, 1)} disabled={i === comp.tracks.length - 1} className="p-1 opacity-30 hover:opacity-80 disabled:opacity-10 transition-opacity shrink-0" aria-label="Move down">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                  </button>
                                  <button onClick={() => handleRemoveFromCompilation(t.id, comp.id)} className="p-1.5 opacity-30 hover:opacity-80 transition-opacity shrink-0" aria-label="Remove">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
                                  </button>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}

      <ShareSheet
        open={!!sharing}
        name={sharing?.name ?? ''}
        tracks={sharing?.tracks ?? []}
        onClose={() => setSharing(null)}
      />
    </main>
  )
}

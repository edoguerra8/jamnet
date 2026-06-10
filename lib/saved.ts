import { Track, Compilation } from './types'

const GENRE_KEY = 'jamnet_genre_playlists'
const COMP_KEY = 'jamnet_compilations'

// ── Genre playlists (auto, per macro-genre) ────────────────────────────────

export function getGenrePlaylists(): Record<string, Track[]> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(GENRE_KEY) || '{}') } catch { return {} }
}

export function isInGenrePlaylist(id: string): boolean {
  return Object.values(getGenrePlaylists()).some(tracks => tracks.some(t => t.id === id))
}

export function addToGenrePlaylist(track: Track): void {
  const playlists = getGenrePlaylists()
  const genre = track.macroGenre || 'World'
  const existing = playlists[genre] || []
  if (existing.some(t => t.id === track.id)) return
  playlists[genre] = [track, ...existing]
  localStorage.setItem(GENRE_KEY, JSON.stringify(playlists))
}

export function removeFromGenrePlaylist(id: string, macroGenre: string): void {
  const playlists = getGenrePlaylists()
  if (!playlists[macroGenre]) return
  playlists[macroGenre] = playlists[macroGenre].filter(t => t.id !== id)
  if (playlists[macroGenre].length === 0) delete playlists[macroGenre]
  localStorage.setItem(GENRE_KEY, JSON.stringify(playlists))
}

// ── Compilations (personali, creabili/rinominabili dall'utente) ────────────

export function getCompilations(): Compilation[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(COMP_KEY) || '[]') } catch { return [] }
}

export function isInAnyCompilation(id: string): boolean {
  return getCompilations().some(c => c.tracks.some(t => t.id === id))
}

export function addToDefaultCompilation(track: Track): void {
  const compilations = getCompilations()
  let def = compilations.find(c => c.id === 'default')
  if (!def) {
    def = { id: 'default', name: 'Compilation', tracks: [], createdAt: Date.now() }
    compilations.unshift(def)
  }
  if (!def.tracks.some(t => t.id === track.id)) {
    def.tracks = [track, ...def.tracks]
  }
  localStorage.setItem(COMP_KEY, JSON.stringify(compilations))
}

export function renameCompilation(id: string, name: string): void {
  const compilations = getCompilations()
  const comp = compilations.find(c => c.id === id)
  if (comp) {
    comp.name = name
    localStorage.setItem(COMP_KEY, JSON.stringify(compilations))
  }
}

export function createCompilation(name = 'Compilation'): Compilation {
  const comp: Compilation = {
    id: `comp_${Date.now()}`,
    name,
    tracks: [],
    createdAt: Date.now(),
  }
  const compilations = getCompilations()
  compilations.unshift(comp)
  localStorage.setItem(COMP_KEY, JSON.stringify(compilations))
  return comp
}

export function removeCompilation(id: string): void {
  const compilations = getCompilations().filter(c => c.id !== id)
  localStorage.setItem(COMP_KEY, JSON.stringify(compilations))
}

export function removeTrackFromCompilation(trackId: string, compilationId: string): void {
  const compilations = getCompilations()
  const comp = compilations.find(c => c.id === compilationId)
  if (comp) {
    comp.tracks = comp.tracks.filter(t => t.id !== trackId)
    localStorage.setItem(COMP_KEY, JSON.stringify(compilations))
  }
}

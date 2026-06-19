import { HistoryEntry, Track } from '../types'

const HISTORY_KEY = 'jamnet_history'
const MAX_ENTRIES = 500

export function getHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch { return [] }
}

export function addToHistory(track: Track): void {
  try {
    const history = getHistory()
    // Avoid duplicate consecutive entries for the same track
    if (history[0]?.id === track.id) return
    const entry: HistoryEntry = {
      id:            track.id,
      title:         track.title,
      artist:        track.artist,
      artworkUrl:    track.artworkUrl,
      appleMusId:    track.appleMusId,
      previewUrl:    track.previewUrl,
      macroArea:     track.macroArea,
      country:       track.country,
      year:          track.year,
      playedAt:      Date.now(),
    }
    history.unshift(entry)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_ENTRIES)))
  } catch {}
}

export function clearHistory(): void {
  try { localStorage.removeItem(HISTORY_KEY) } catch {}
}

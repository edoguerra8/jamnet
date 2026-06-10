import { Track } from './types'

const KEY = 'jamnet_saved'

export function getSavedTracks(): Track[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

export function isSaved(id: string): boolean {
  return getSavedTracks().some(t => t.id === id)
}

export function toggleSaved(track: Track): boolean {
  const saved = getSavedTracks()
  const exists = saved.some(t => t.id === track.id)
  if (exists) {
    localStorage.setItem(KEY, JSON.stringify(saved.filter(t => t.id !== track.id)))
    return false
  }
  localStorage.setItem(KEY, JSON.stringify([track, ...saved]))
  return true
}

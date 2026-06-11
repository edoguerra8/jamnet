export interface Track {
  id: string              // Supabase UUID
  mb_recording_id?: string | null
  title: string
  artist: string          // artist_name
  artist_mb_id?: string | null
  artworkUrl: string | null
  youtubeVideoId: string | null
  previewUrl: string | null  // iTunes 30–90s preview (fallback)
  year: number
  country: string
  macroArea: string
  tags: string[]
  weight: number
  // legacy fields kept for library/saved compatibility
  album?: string
  genre?: string
  region?: string
  macroGenre?: string
}

export interface Compilation {
  id: string
  name: string
  tracks: Track[]
  createdAt: number
}

export type FlowMode = 'rotta' | 'vortice'

export interface HistoryEntry {
  id: string
  title: string
  artist: string
  artworkUrl: string | null
  youtubeVideoId: string | null
  previewUrl: string | null
  macroArea: string
  country: string
  year: number
  playedAt: number
}

export interface Track {
  id: string              // Supabase UUID
  mb_recording_id?: string | null
  title: string
  artist: string          // artist_name
  artist_mb_id?: string | null
  artworkUrl: string | null
  appleMusId: string | null    // Apple Music ID (MusicKit playback)
  youtubeVideoId: string | null  // kept in schema, no longer populated
  previewUrl: string | null      // iTunes preview (fallback when appleMusId absent)
  isNewRelease: boolean
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

// 'course'/'whirl' are the canonical names; 'rotta'/'vortice' kept as aliases
export type FlowMode = 'course' | 'whirl' | 'rotta' | 'vortice'

export interface HistoryEntry {
  id: string
  title: string
  artist: string
  artworkUrl: string | null
  appleMusId: string | null
  youtubeVideoId: string | null
  previewUrl: string | null
  macroArea: string
  country: string
  year: number
  playedAt: number
}

import { Track } from '../types'

// Shared between /api/discover and /api/track

export const TRACK_COLUMNS =
  'id, mb_recording_id, title, artist_name, artist_mb_id, artwork_url, apple_music_id, itunes_preview_url, is_new_release, year, country, macro_area, tags, weight'

export function dbRowToTrack(r: Record<string, unknown>): Track {
  return {
    id:              String(r.id),
    mb_recording_id: r.mb_recording_id as string | null,
    title:           String(r.title),
    artist:          String(r.artist_name),
    artist_mb_id:    r.artist_mb_id as string | null,
    artworkUrl:      r.artwork_url as string | null,
    appleMusId:      r.apple_music_id as string | null,
    previewUrl:      r.itunes_preview_url as string | null,
    isNewRelease:    Boolean(r.is_new_release),
    year:            Number(r.year) || 0,
    country:         String(r.country || ''),
    macroArea:       String(r.macro_area || ''),
    tags:            (r.tags as string[]) || [],
    weight:          Number(r.weight) || 1,
    // legacy shims
    album:           '',
    genre:           ((r.tags as string[]) || [])[0] || 'World Music',
    region:          String(r.macro_area || ''),
  }
}

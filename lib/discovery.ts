import { Track } from './types'
import { getMacroGenre } from './genres'
import { countryToRegion } from './strategies'

// ── iTunes fetch ──────────────────────────────────────────────────────────────

async function fetchFromTerm(
  term: string,
  region: string,
  yearFrom: number,
  yearTo: number,
  excludeSet: Set<string>,
  country = 'US',
): Promise<Track[]> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=200&country=${country}`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()

    const raw = (data.results as Record<string, unknown>[])
      .filter(r => r.previewUrl && r.artworkUrl100)
      .filter(r => !excludeSet.has(String(r.trackId)))

    const yearFiltered = raw.filter(r => {
      const y = new Date(r.releaseDate as string).getFullYear()
      return y >= yearFrom && y <= yearTo
    })

    const source = yearFiltered.length > 4 ? yearFiltered : raw

    return source.map(r => {
      const iTunesGenre = (r.primaryGenreName as string) || 'World Music'
      return {
        id:         String(r.trackId),
        title:      r.trackName as string,
        artist:     r.artistName as string,
        album:      (r.collectionName as string) || '',
        artworkUrl: (r.artworkUrl100 as string).replace(/\/\d+x\d+bb/, '/600x600bb'),
        previewUrl: r.previewUrl as string,
        year:       new Date(r.releaseDate as string).getFullYear(),
        genre:      iTunesGenre,
        region,
        macroGenre: getMacroGenre(iTunesGenre),
      }
    })
  } catch { return [] }
}

// ── Last.fm helpers ───────────────────────────────────────────────────────────

async function lastfmTagArtistsPage(tag: string, page: number, key: string): Promise<string[]> {
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettopartists&tag=${encodeURIComponent(tag)}&api_key=${key}&format=json&limit=50&page=${page}`
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.topartists?.artist ?? []).map((a: { name: string }) => a.name)
  } catch { return [] }
}

async function lastfmSimilarArtists(artist: string, key: string): Promise<string[]> {
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(artist)}&api_key=${key}&format=json&limit=15`
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.similarartists?.artist ?? []).map((a: { name: string }) => a.name)
  } catch { return [] }
}

// ── MusicBrainz ───────────────────────────────────────────────────────────────

async function musicBrainzAreaArtists(country: string, offset: number): Promise<string[]> {
  try {
    const q = encodeURIComponent(`area:"${country}"`)
    const url = `https://musicbrainz.org/ws/2/artist?query=${q}&limit=25&offset=${offset}&fmt=json`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JamNet/1.0 (music-discovery-app)' },
      next: { revalidate: 604800 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.artists ?? [])
      .map((a: { name: string }) => a.name)
      .filter(Boolean) as string[]
  } catch { return [] }
}

// ── Strategy executor ─────────────────────────────────────────────────────────

async function executeStrategy(
  code: string,
  yearFrom: number,
  yearTo: number,
  excludeSet: Set<string>,
  apiKey: string,
): Promise<Track[]> {
  const parts = code.split('::')
  const type = parts[0]

  try {
    switch (type) {
      case 's': {
        // s::term::region
        const [, term, region = 'World'] = parts
        return fetchFromTerm(term, region, yearFrom, yearTo, excludeSet)
      }

      case 'i': {
        // i::term::CC::region
        const [, term, cc, region = 'World'] = parts
        return fetchFromTerm(term, region, yearFrom, yearTo, excludeSet, cc)
      }

      case 't': {
        // t::tag::page::region  — Last.fm tag artists → iTunes
        const [, tag, pageStr, region = 'World'] = parts
        if (!apiKey) return []
        const page = parseInt(pageStr, 10) || 1
        const artists = await lastfmTagArtistsPage(tag, page, apiKey)
        const picks = artists.sort(() => Math.random() - 0.5).slice(0, 4)
        const batches = await Promise.all(
          picks.map(a => fetchFromTerm(a, region, yearFrom, yearTo, excludeSet))
        )
        return batches.flat()
      }

      case 'a': {
        // a::artist::region  — iTunes artist search + similar artists
        const [, artist, region = 'World'] = parts
        const searches: Promise<Track[]>[] = [
          fetchFromTerm(artist, region, yearFrom, yearTo, excludeSet),
        ]
        if (apiKey) {
          const similar = await lastfmSimilarArtists(artist, apiKey)
          for (const s of similar.slice(0, 2)) {
            searches.push(fetchFromTerm(s, region, yearFrom, yearTo, excludeSet))
          }
        }
        const batches = await Promise.all(searches)
        return batches.flat()
      }

      case 'm': {
        // m::country::offset  — MusicBrainz country artists → iTunes
        const [, country, offsetStr] = parts
        const offset = parseInt(offsetStr, 10) || 0
        const region = countryToRegion(country)
        const artists = await musicBrainzAreaArtists(country, offset)
        if (artists.length === 0) return []
        const picks = artists.slice(0, 3)
        const batches = await Promise.all(
          picks.map(a => fetchFromTerm(a, region, yearFrom, yearTo, excludeSet))
        )
        return batches.flat()
      }

      default:
        return []
    }
  } catch { return [] }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function executeStrategies(
  codes: string[],
  yearFrom: number,
  yearTo: number,
  exclude: string[],
): Promise<Track[]> {
  const excludeSet = new Set(exclude)
  const apiKey = process.env.LASTFM_API_KEY || ''

  const batches = await Promise.all(
    codes.map(code => executeStrategy(code, yearFrom, yearTo, excludeSet, apiKey))
  )

  const seen = new Set<string>()
  const merged: Track[] = []
  for (const track of batches.flat()) {
    if (!seen.has(track.id)) {
      seen.add(track.id)
      merged.push(track)
    }
  }
  return merged.sort(() => Math.random() - 0.5)
}

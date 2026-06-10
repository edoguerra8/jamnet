import { Track } from './types'

const SEEDS = [
  'desert blues Mali',
  'Ethiopian jazz 1970',
  'bossa nova Brazil 1960',
  'Afrobeat Nigeria Fela',
  'flamenco Spain',
  'cumbia Colombia',
  'folk Iceland Scandinavia',
  'psychedelic rock 1960s',
  'soul funk 1970s',
  'jazz New Orleans',
  'reggae Jamaica roots',
  'fado Portugal',
  'bluegrass Appalachia',
  'Cuban son guajira',
  'tango Argentina',
  'Celtic folk Ireland',
  'qawwali Sufi',
  'highlife Ghana',
  'tropicalia Brazil',
  'mbalax Senegal',
]

export const HOME_SUGGESTIONS = [
  { label: 'From Bamako, 1972',     query: 'desert blues Mali 1970' },
  { label: 'Somewhere unexpected',  query: 'world music rare folk' },
  { label: 'Ethiopian jazz',        query: 'Ethiopian jazz Mulatu' },
  { label: 'Music for late nights', query: 'jazz nocturne late night' },
  { label: 'Afrobeat classics',     query: 'Afrobeat Fela Nigeria' },
  { label: 'From the Andes',        query: 'Andean folk cumbia' },
  { label: 'Bossa nova',            query: 'bossa nova samba Brazil' },
  { label: 'Folk from the north',   query: 'Nordic folk Scandinavian' },
  { label: 'Psychedelic sixties',   query: 'psychedelic rock garage 1960s' },
  { label: 'Soul and funk',         query: 'soul funk 1970s rare' },
  { label: 'Roots reggae',          query: 'roots reggae dub Jamaica' },
  { label: 'Something rare',        query: 'obscure world music ethnic' },
  { label: 'Jazz anywhere',         query: 'jazz cool hard bop' },
  { label: 'Forgotten albums',      query: 'rare soul obscure blues' },
  { label: 'From the Mediterranean', query: 'Mediterranean folk Italian Greek' },
]

export function getRandomSuggestions(count = 3) {
  return [...HOME_SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, count)
}

function randomSeed() {
  return SEEDS[Math.floor(Math.random() * SEEDS.length)]
}

export async function discoverTracks(query: string): Promise<Track[]> {
  const term = query.trim() || randomSeed()
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=50`

  const res = await fetch(url, { next: { revalidate: 600 } })
  if (!res.ok) return []
  const data = await res.json()

  return (data.results as Record<string, unknown>[])
    .filter(r => r.previewUrl && r.artworkUrl100)
    .map(r => ({
      id: String(r.trackId),
      title: r.trackName as string,
      artist: r.artistName as string,
      album: (r.collectionName as string) || '',
      artworkUrl: (r.artworkUrl100 as string).replace(/\/\d+x\d+bb/, '/600x600bb'),
      previewUrl: r.previewUrl as string,
      year: new Date(r.releaseDate as string).getFullYear(),
      genre: (r.primaryGenreName as string) || 'Music',
    }))
    .sort(() => Math.random() - 0.5)
}

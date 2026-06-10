import { Track } from './types'

const AREA_SEEDS: Record<string, string[]> = {
  'West Africa': [
    'Mali desert blues', 'Afrobeat Nigeria Fela', 'highlife Ghana',
    'mbalax Senegal Youssou', 'Mandingo music Guinea', 'Wassoulou Mali',
  ],
  'North Africa': [
    'Morocco gnawa Marrakech', 'Egyptian Arabic shaabi',
    'Algerian raï Khaled', 'Amazigh Berber folk', 'Tunisian malouf',
  ],
  'Middle East': [
    'Arabic maqam oud classic', 'Turkish arabesque Arabesk',
    'Persian classical dastgah', 'Lebanese music 1970s', 'Khaleeji Gulf music',
  ],
  'South Asia': [
    'Indian classical raga sitar', 'qawwali Sufi Nusrat Pakistan',
    'Bollywood classic Hindi', 'Bengali folk baul music', 'Carnatic classical Tamil',
  ],
  'East Asia': [
    'Japanese enka kayokyoku', 'Korean folk minyo trot pansori',
    'Chinese folk guqin erhu', 'Okinawa sanshin music', 'Mongolian throat singing',
  ],
  'Southeast Asia': [
    'Indonesian gamelan kroncong dangdut', 'Thai luk thung classic',
    'Vietnamese nhạc vàng classic', 'Filipino OPM classic', 'Cambodian Khmer classic',
  ],
  'Latin America': [
    'cumbia Colombia Vallenato', 'tango Argentina bandoneon',
    'bossa nova Brazil Jobim', 'tropicalia Caetano Gilberto', 'Andean folk huayno',
  ],
  'Caribbean': [
    'roots reggae Jamaica dub', 'Cuban son bolero guajira',
    'calypso soca Trinidad', 'kompa Haiti', 'salsa Puerto Rico clave',
  ],
  'Europe': [
    'flamenco Spain Paco guitar', 'fado Portugal Amália',
    'Celtic folk Ireland reels', 'Greek laïká rebetiko', 'Balkan folk brass',
  ],
  'North America': [
    'Delta blues Mississippi electric', 'New Orleans jazz brass second line',
    'Appalachian bluegrass old-time', 'soul funk 1970s Stax', 'country roots outlaw',
  ],
  'Oceania': [
    'Aboriginal Australian didgeridoo', 'Māori waiata traditional',
    'Hawaiian slack key guitar', 'Pacific island music Polynesian',
  ],
}

const GLOBAL_SEEDS = [
  'desert blues Mali', 'Ethiopian jazz 1970', 'bossa nova Brazil 1960',
  'Afrobeat Nigeria Fela', 'flamenco Spain', 'cumbia Colombia',
  'Scandinavian folk music', 'psychedelic rock 1960s', 'soul funk 1970s rare',
  'jazz New Orleans brass', 'reggae Jamaica roots dub', 'fado Portugal classic',
  'bluegrass Appalachia old time', 'Cuban son guajira', 'tango Argentina',
  'Celtic folk Ireland', 'qawwali Sufi Nusrat', 'highlife Ghana',
  'tropicalia Brazil', 'mbalax Senegal',
]

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function seedToRegion(seed: string): string {
  const s = seed.toLowerCase()
  if (/mali|nigeria|ghana|senegal|afrobeat|highlife|mbalax|wassoulou|guinea/.test(s)) return 'West Africa'
  if (/morocco|egypt|algeria|tunisia|amazigh|berber|gnawa/.test(s)) return 'North Africa'
  if (/arabic|turkish|persian|lebanese|khaleeji|gulf|oud|maqam/.test(s)) return 'Middle East'
  if (/india|pakistan|bengali|bollywood|qawwali|raga|sufi|carnatic|nusrat|hindi/.test(s)) return 'South Asia'
  if (/japan|korean|chinese|okinawa|mongol|enka/.test(s)) return 'East Asia'
  if (/indonesia|thai|vietnam|filipino|cambodia|khmer|gamelan/.test(s)) return 'Southeast Asia'
  if (/colombia|argentina|brazil|bossa|tropicalia|cumbia|tango|andean|jobim|caetano|vallenato|huayno/.test(s)) return 'Latin America'
  if (/jamaica|cuba|calypso|trinidad|soca|haiti|reggae|salsa|puerto/.test(s)) return 'Caribbean'
  if (/spain|portugal|ireland|greek|balkan|fado|flamenco|celtic|rebetiko|paco|amália/.test(s)) return 'Europe'
  if (/blues|jazz|new orleans|appalachian|soul|funk|country|bluegrass|stax|outlaw|mississippi/.test(s)) return 'North America'
  if (/australia|māori|pacific|hawaiian|polynesian|aboriginal|didgeridoo/.test(s)) return 'Oceania'
  if (/ethiopia|scandinavia|nordic|iceland/.test(s)) return 'Europe'
  return 'West Africa'
}

export async function discoverTracks(
  areas: string[],
  yearFrom: number,
  yearTo: number,
  exclude: string[],
): Promise<Track[]> {
  const useAll = areas.length === 0 || areas.includes('All')

  let seed: string
  let region: string

  if (useAll) {
    seed = randomFrom(GLOBAL_SEEDS)
    region = seedToRegion(seed)
  } else {
    const area = randomFrom(areas)
    seed = randomFrom(AREA_SEEDS[area] || GLOBAL_SEEDS)
    region = area
  }

  if (yearTo - yearFrom < 25) {
    const mid = Math.round((yearFrom + yearTo) / 2)
    seed += ` ${Math.floor(mid / 10) * 10}s`
  }

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(seed)}&media=music&entity=song&limit=100`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) return []
  const data = await res.json()

  const excludeSet = new Set(exclude)

  const raw = (data.results as Record<string, unknown>[])
    .filter(r => r.previewUrl && r.artworkUrl100)
    .filter(r => !excludeSet.has(String(r.trackId)))

  const yearFiltered = raw.filter(r => {
    const y = new Date(r.releaseDate as string).getFullYear()
    return y >= yearFrom && y <= yearTo
  })

  const source = yearFiltered.length > 0 ? yearFiltered : raw

  return source
    .map(r => ({
      id: String(r.trackId),
      title: r.trackName as string,
      artist: r.artistName as string,
      album: (r.collectionName as string) || '',
      artworkUrl: (r.artworkUrl100 as string).replace(/\/\d+x\d+bb/, '/600x600bb'),
      previewUrl: r.previewUrl as string,
      year: new Date(r.releaseDate as string).getFullYear(),
      genre: (r.primaryGenreName as string) || 'Music',
      region,
    }))
    .sort(() => Math.random() - 0.5)
}

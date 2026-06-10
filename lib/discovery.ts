import { Track } from './types'

const AREA_SEEDS: Record<string, string[]> = {
  'West Africa': [
    'Mali desert blues', 'Afrobeat Nigeria Fela', 'highlife Ghana',
    'mbalax Senegal Youssou', 'Mandingo music Guinea', 'Wassoulou Mali',
    'Afropop West Africa', 'jùjú music Nigeria', 'Guinean kora music',
    'Malian blues roots', 'Ghanaian palm wine music', 'Senegalese sabar',
  ],
  'North Africa': [
    'Morocco gnawa Marrakech', 'Egyptian Arabic shaabi',
    'Algerian raï Khaled', 'Amazigh Berber folk', 'Tunisian malouf',
    'Moroccan chaabi', 'Egyptian classical Umm Kulthum', 'Libyan music',
    'North African Arabic music', 'Algerian chaabi folk',
  ],
  'Middle East': [
    'Arabic maqam oud classic', 'Turkish arabesque Arabesk',
    'Persian classical dastgah', 'Lebanese music 1970s', 'Khaleeji Gulf music',
    'Yemeni music traditional', 'Syrian muwashahat', 'Iraqi maqam',
    'Turkish folk music Anatolian', 'Armenian folk duduk',
    'Israeli mizrahi music', 'Kurdish folk music',
  ],
  'South Asia': [
    'Indian classical raga sitar', 'qawwali Sufi Nusrat Pakistan',
    'Bollywood classic Hindi', 'Bengali folk baul music', 'Carnatic classical Tamil',
    'Hindustani classical vocal', 'Punjabi folk bhangra', 'Sri Lankan baila',
    'Nepali folk music', 'Rajasthani folk music', 'Sindhi music Pakistan',
    'Indian devotional music', 'ghazal Urdu classic',
  ],
  'East Asia': [
    'Japanese enka kayokyoku', 'Korean folk minyo trot pansori',
    'Chinese folk guqin erhu', 'Okinawa sanshin music', 'Mongolian throat singing',
    'Japanese traditional gagaku', 'Taiwanese folk music', 'Korean gayageum',
    'Chinese opera Peking', 'Japanese folk minyō',
  ],
  'Southeast Asia': [
    'Indonesian gamelan kroncong dangdut', 'Thai luk thung classic',
    'Vietnamese nhạc vàng classic', 'Filipino OPM classic', 'Cambodian Khmer classic',
    'Burmese traditional music', 'Malaysian folk joget', 'Balinese gamelan',
    'Laotian folk music', 'Javanese music', 'Singapore folk Malay',
  ],
  'Latin America': [
    'cumbia Colombia Vallenato', 'tango Argentina bandoneon',
    'bossa nova Brazil Jobim', 'tropicalia Caetano Gilberto', 'Andean folk huayno',
    'nueva trova Cuba Chile', 'salsa Colombia Cali', 'samba Brazil classic',
    'Mexican son jarocho', 'Peruvian criolla music', 'Bolivian folk music',
    'Venezuelan joropo', 'Chilean cueca', 'Argentine folklore Atahualpa',
    'MPB Brasil', 'forró baião Brazil',
  ],
  'Caribbean': [
    'roots reggae Jamaica dub', 'Cuban son bolero guajira',
    'calypso soca Trinidad', 'kompa Haiti', 'salsa Puerto Rico clave',
    'Jamaican rocksteady', 'Cuban jazz Afro-Cuban', 'mento Jamaica folk',
    'steelpan Trinidad', 'Dominican merengue classic', 'zouk Antilles',
    'Barbados music', 'Guadeloupean gwoka',
  ],
  'Europe': [
    'flamenco Spain Paco guitar', 'fado Portugal Amália',
    'Celtic folk Ireland reels', 'Greek laïká rebetiko', 'Balkan folk brass',
    'French chanson classic', 'Italian canzone classic', 'Portuguese folk',
    'Scandinavian folk Nordic', 'Eastern European folk', 'klezmer Jewish folk',
    'Breton music Celtic France', 'Sephardic music', 'Georgian polyphony',
  ],
  'North America': [
    'Delta blues Mississippi electric', 'New Orleans jazz brass second line',
    'Appalachian bluegrass old-time', 'soul funk 1970s Stax', 'country roots outlaw',
    'Chicago blues electric', 'gospel soul spiritual', 'Americana folk roots',
    'jazz bebop hard bop', 'New York soul classic', 'folk protest 1960s',
    'Tex-Mex conjunto', 'Native American music traditional', 'Cajun zydeco Louisiana',
  ],
  'Oceania': [
    'Aboriginal Australian didgeridoo', 'Māori waiata traditional',
    'Hawaiian slack key guitar', 'Pacific island music Polynesian',
    'Australian bush music folk', 'Tongan music', 'Samoan music Pacific',
    'Papua New Guinea folk', 'Fijian music traditional',
  ],
}

const GLOBAL_SEEDS = [
  'desert blues Mali', 'Ethiopian jazz 1970', 'bossa nova Brazil 1960',
  'Afrobeat Nigeria Fela', 'flamenco Spain', 'cumbia Colombia',
  'Scandinavian folk music', 'psychedelic rock 1960s', 'soul funk 1970s rare',
  'jazz New Orleans brass', 'reggae Jamaica roots dub', 'fado Portugal classic',
  'bluegrass Appalachia old time', 'Cuban son guajira', 'tango Argentina',
  'Celtic folk Ireland', 'qawwali Sufi Nusrat', 'highlife Ghana',
  'tropicalia Brazil', 'mbalax Senegal', 'Turkish folk Anatolian',
  'Greek rebetiko', 'Carnatic classical', 'Mongolian traditional',
  'Hawaiian slack key', 'Balkan brass', 'Persian classical',
  'New Orleans jazz', 'French chanson classic', 'Andean folk',
  'Okinawa traditional', 'African folk roots', 'Jamaican rocksteady',
  'Italian canzone classic', 'mpb Brasil', 'raga Indian classical',
]

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function twoDistinct<T>(arr: T[]): [T, T] {
  if (arr.length < 2) return [arr[0], arr[0]]
  const i = Math.floor(Math.random() * arr.length)
  let j = Math.floor(Math.random() * (arr.length - 1))
  if (j >= i) j++
  return [arr[i], arr[j]]
}

function seedToRegion(seed: string): string {
  const s = seed.toLowerCase()
  if (/mali|nigeria|ghana|senegal|afrobeat|highlife|mbalax|wassoulou|guinea|jùjú/.test(s)) return 'West Africa'
  if (/morocco|egypt|algeria|tunisia|amazigh|berber|gnawa|libyan/.test(s)) return 'North Africa'
  if (/arabic|turkish|persian|lebanese|khaleeji|gulf|oud|maqam|yemeni|syrian|iraqi|armenian|kurdish|mizrahi/.test(s)) return 'Middle East'
  if (/india|pakistan|bengali|bollywood|qawwali|raga|sufi|carnatic|nusrat|hindi|punjabi|rajasthani|sindhi|ghazal|nepali/.test(s)) return 'South Asia'
  if (/japan|korean|chinese|okinawa|mongol|enka|taiwanese|gayageum/.test(s)) return 'East Asia'
  if (/indonesia|thai|vietnam|filipino|cambodia|khmer|gamelan|burmese|malaysian|balinese|laotian|javanese/.test(s)) return 'Southeast Asia'
  if (/colombia|argentina|brazil|bossa|tropicalia|cumbia|tango|andean|jobim|caetano|vallenato|huayno|forró|samba|joropo|cueca|mpb|brasileiro/.test(s)) return 'Latin America'
  if (/jamaica|cuba|calypso|trinidad|soca|haiti|reggae|salsa|puerto|merengue|zouk|rocksteady|mento/.test(s)) return 'Caribbean'
  if (/spain|portugal|ireland|greek|balkan|fado|flamenco|celtic|rebetiko|paco|chanson|française|italian|canzone|klezmer|breton|georgian|sephardic/.test(s)) return 'Europe'
  if (/blues|new orleans|appalachian|soul|funk|country|bluegrass|stax|outlaw|mississippi|gospel|cajun|zydeco|tex.mex|conjunto/.test(s)) return 'North America'
  if (/australia|māori|pacific|hawaiian|polynesian|aboriginal|didgeridoo|tongan|samoan|fijian/.test(s)) return 'Oceania'
  if (/ethiopia|scandinavia|nordic|iceland|jazz|folk/.test(s)) return 'Europe'
  return 'West Africa'
}

function applyYearHint(seed: string, yearFrom: number, yearTo: number): string {
  if (yearTo - yearFrom < 25) {
    const mid = Math.round((yearFrom + yearTo) / 2)
    return `${seed} ${Math.floor(mid / 10) * 10}s`
  }
  return seed
}

async function fetchFromSeed(
  seed: string,
  region: string,
  yearFrom: number,
  yearTo: number,
  excludeSet: Set<string>,
): Promise<Track[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(seed)}&media=music&entity=song&limit=200`
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

  return source.map(r => ({
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
}

export async function discoverTracks(
  areas: string[],
  yearFrom: number,
  yearTo: number,
  exclude: string[],
): Promise<Track[]> {
  const useAll = areas.length === 0 || areas.includes('All')
  const excludeSet = new Set(exclude)

  // Pick 2 distinct seeds in parallel to maximise catalog depth
  let seedA: string, seedB: string, regionA: string, regionB: string

  if (useAll) {
    const [sA, sB] = twoDistinct(GLOBAL_SEEDS)
    seedA = applyYearHint(sA, yearFrom, yearTo)
    seedB = applyYearHint(sB, yearFrom, yearTo)
    regionA = seedToRegion(sA)
    regionB = seedToRegion(sB)
  } else {
    // If multiple areas selected, use one seed per area (or two from the same if only one)
    if (areas.length >= 2) {
      const [aA, aB] = twoDistinct(areas)
      seedA = applyYearHint(randomFrom(AREA_SEEDS[aA] || GLOBAL_SEEDS), yearFrom, yearTo)
      seedB = applyYearHint(randomFrom(AREA_SEEDS[aB] || GLOBAL_SEEDS), yearFrom, yearTo)
      regionA = aA
      regionB = aB
    } else {
      const area = areas[0]
      const seeds = AREA_SEEDS[area] || GLOBAL_SEEDS
      const [sA, sB] = twoDistinct(seeds)
      seedA = applyYearHint(sA, yearFrom, yearTo)
      seedB = applyYearHint(sB, yearFrom, yearTo)
      regionA = area
      regionB = area
    }
  }

  const [tracksA, tracksB] = await Promise.all([
    fetchFromSeed(seedA, regionA, yearFrom, yearTo, excludeSet),
    fetchFromSeed(seedB, regionB, yearFrom, yearTo, excludeSet),
  ])

  // Merge, deduplicate by id, shuffle
  const seen = new Set<string>()
  const merged: Track[] = []
  for (const t of [...tracksA, ...tracksB]) {
    if (!seen.has(t.id)) {
      seen.add(t.id)
      merged.push(t)
    }
  }

  return merged.sort(() => Math.random() - 0.5)
}

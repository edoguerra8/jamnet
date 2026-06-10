import { Track } from './types'
import { getMacroGenre, AREA_LASTFM_TAGS, GLOBAL_LASTFM_TAGS } from './genres'

const AREA_SEEDS: Record<string, string[]> = {
  'West Africa': [
    'Mali desert blues', 'Afrobeat Nigeria Fela', 'highlife Ghana', 'mbalax Senegal Youssou',
    'Mandingo music Guinea', 'Wassoulou Mali', 'Afropop West Africa', 'jùjú music Nigeria',
    'Guinean kora music', 'Malian blues roots', 'Ghanaian palm wine music', 'Senegalese sabar',
  ],
  'North Africa': [
    'Morocco gnawa Marrakech', 'Egyptian Arabic shaabi', 'Algerian raï Khaled',
    'Amazigh Berber folk', 'Tunisian malouf', 'Moroccan chaabi',
    'Egyptian classical Umm Kulthum', 'North African Arabic music', 'Algerian chaabi folk',
  ],
  'Middle East': [
    'Arabic maqam oud classic', 'Turkish arabesque Arabesk', 'Persian classical dastgah',
    'Lebanese music 1970s', 'Khaleeji Gulf music', 'Yemeni music traditional',
    'Syrian muwashahat', 'Iraqi maqam', 'Turkish folk music Anatolian',
    'Armenian folk duduk', 'Israeli mizrahi music', 'Kurdish folk music',
  ],
  'South Asia': [
    'Indian classical raga sitar', 'qawwali Sufi Nusrat Pakistan', 'Bollywood classic Hindi',
    'Bengali folk baul music', 'Carnatic classical Tamil', 'Hindustani classical vocal',
    'Punjabi folk bhangra', 'Sri Lankan baila', 'Nepali folk music',
    'Rajasthani folk music', 'ghazal Urdu classic',
  ],
  'East Asia': [
    'Japanese enka kayokyoku', 'Korean folk minyo trot pansori', 'Chinese folk guqin erhu',
    'Okinawa sanshin music', 'Mongolian throat singing', 'Japanese traditional gagaku',
    'Taiwanese folk music', 'Korean gayageum', 'Chinese opera Peking',
  ],
  'Southeast Asia': [
    'Indonesian gamelan kroncong dangdut', 'Thai luk thung classic', 'Vietnamese nhạc vàng classic',
    'Filipino OPM classic', 'Cambodian Khmer classic', 'Burmese traditional music',
    'Malaysian folk joget', 'Balinese gamelan', 'Javanese music',
  ],
  'Latin America': [
    'cumbia Colombia Vallenato', 'tango Argentina bandoneon', 'bossa nova Brazil Jobim',
    'tropicalia Caetano Gilberto', 'Andean folk huayno', 'nueva trova Cuba Chile',
    'samba Brazil classic', 'Mexican son jarocho', 'Peruvian criolla music',
    'Venezuelan joropo', 'Chilean cueca', 'Argentine folklore', 'MPB Brasil', 'forró baião Brazil',
  ],
  'Caribbean': [
    'roots reggae Jamaica dub', 'Cuban son bolero guajira', 'calypso soca Trinidad',
    'kompa Haiti', 'salsa Puerto Rico clave', 'Jamaican rocksteady',
    'Cuban jazz Afro-Cuban', 'mento Jamaica folk', 'Dominican merengue classic', 'zouk Antilles',
  ],
  'Europe': [
    'flamenco Spain Paco guitar', 'fado Portugal Amália', 'Celtic folk Ireland reels',
    'Greek laïká rebetiko', 'Balkan folk brass', 'French chanson classic',
    'Italian canzone classic', 'Scandinavian folk Nordic', 'klezmer Jewish folk',
    'Breton music Celtic France', 'Sephardic music', 'Georgian polyphony',
  ],
  'North America': [
    'Delta blues Mississippi electric', 'New Orleans jazz brass second line',
    'Appalachian bluegrass old-time', 'soul funk 1970s Stax', 'country roots outlaw',
    'Chicago blues electric', 'gospel soul spiritual', 'jazz bebop hard bop',
    'folk protest 1960s', 'Cajun zydeco Louisiana', 'Tex-Mex conjunto',
  ],
  'Oceania': [
    'Aboriginal Australian didgeridoo', 'Māori waiata traditional',
    'Hawaiian slack key guitar', 'Pacific island music Polynesian',
    'Tongan music', 'Samoan music Pacific', 'Fijian music traditional',
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
  'Okinawa traditional', 'Jamaican rocksteady', 'Italian canzone classic',
  'mpb Brasil', 'raga Indian classical', 'Georgian polyphony',
  'Delta blues electric', 'Cuban son classic',
]

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function twoDistinct<T>(arr: T[]): [T, T] {
  if (arr.length === 1) return [arr[0], arr[0]]
  const i = Math.floor(Math.random() * arr.length)
  let j = Math.floor(Math.random() * (arr.length - 1))
  if (j >= i) j++
  return [arr[i], arr[j]]
}

function seedToRegion(seed: string): string {
  const s = seed.toLowerCase()
  if (/mali|nigeria|ghana|senegal|afrobeat|highlife|mbalax|wassoulou|guinea|jùjú/.test(s)) return 'West Africa'
  if (/morocco|egypt|algeria|tunisia|amazigh|berber|gnawa/.test(s)) return 'North Africa'
  if (/arabic|turkish|persian|lebanese|khaleeji|gulf|oud|maqam|yemeni|armenian|kurdish/.test(s)) return 'Middle East'
  if (/india|pakistan|bengali|bollywood|qawwali|raga|sufi|carnatic|nusrat|hindi|punjabi|ghazal/.test(s)) return 'South Asia'
  if (/japan|korean|chinese|okinawa|mongol|enka|taiwanese|gayageum/.test(s)) return 'East Asia'
  if (/indonesia|thai|vietnam|filipino|cambodia|khmer|gamelan|burmese|javanese/.test(s)) return 'Southeast Asia'
  if (/colombia|argentina|brazil|bossa|tropicalia|cumbia|tango|andean|jobim|caetano|vallenato|huayno|forró|samba|joropo|mpb/.test(s)) return 'Latin America'
  if (/jamaica|cuba|calypso|trinidad|soca|haiti|reggae|salsa|puerto|merengue|zouk|rocksteady/.test(s)) return 'Caribbean'
  if (/spain|portugal|ireland|greek|balkan|fado|flamenco|celtic|rebetiko|chanson|canzone|klezmer|georgian|sephardic/.test(s)) return 'Europe'
  if (/blues|new orleans|appalachian|soul|funk|country|bluegrass|stax|outlaw|mississippi|gospel|cajun|zydeco/.test(s)) return 'North America'
  if (/australia|māori|pacific|hawaiian|polynesian|aboriginal|tongan|samoan/.test(s)) return 'Oceania'
  if (/ethiopia|scandinavia|nordic|folk/.test(s)) return 'Europe'
  return 'West Africa'
}

function applyYearHint(seed: string, yearFrom: number, yearTo: number): string {
  if (yearTo - yearFrom < 25) {
    const mid = Math.round((yearFrom + yearTo) / 2)
    return `${seed} ${Math.floor(mid / 10) * 10}s`
  }
  return seed
}

// ── Last.fm helpers ─────────────────────────────────────────────────────────

async function lastfmSimilarArtists(artist: string, key: string): Promise<string[]> {
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(artist)}&api_key=${key}&format=json&limit=8`
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.similarartists?.artist ?? []).map((a: { name: string }) => a.name)
  } catch { return [] }
}

async function lastfmTagArtists(tag: string, key: string): Promise<string[]> {
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettopartists&tag=${encodeURIComponent(tag)}&api_key=${key}&format=json&limit=20`
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.topartists?.artist ?? []).map((a: { name: string }) => a.name)
  } catch { return [] }
}

// ── iTunes fetch ─────────────────────────────────────────────────────────────

async function fetchFromTerm(
  term: string,
  region: string,
  yearFrom: number,
  yearTo: number,
  excludeSet: Set<string>,
): Promise<Track[]> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=200`
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
        id: String(r.trackId),
        title: r.trackName as string,
        artist: r.artistName as string,
        album: (r.collectionName as string) || '',
        artworkUrl: (r.artworkUrl100 as string).replace(/\/\d+x\d+bb/, '/600x600bb'),
        previewUrl: r.previewUrl as string,
        year: new Date(r.releaseDate as string).getFullYear(),
        genre: iTunesGenre,
        region,
        macroGenre: getMacroGenre(iTunesGenre),
      }
    })
  } catch { return [] }
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function discoverTracks(
  areas: string[],
  yearFrom: number,
  yearTo: number,
  exclude: string[],
  pivot?: string,  // artist name from a recently seen track → enables infinite graph
): Promise<Track[]> {
  const excludeSet = new Set(exclude)
  const apiKey = process.env.LASTFM_API_KEY || ''
  const useAll = areas.length === 0 || areas.includes('All')

  // ── Build search terms ──────────────────────────────────────────────────

  const searches: Array<{ term: string; region: string }> = []

  // Always: 2 seeds from our static pool
  if (useAll) {
    const [sA, sB] = twoDistinct(GLOBAL_SEEDS)
    searches.push({ term: applyYearHint(sA, yearFrom, yearTo), region: seedToRegion(sA) })
    searches.push({ term: applyYearHint(sB, yearFrom, yearTo), region: seedToRegion(sB) })
  } else {
    if (areas.length >= 2) {
      const [aA, aB] = twoDistinct(areas)
      searches.push({
        term: applyYearHint(randomFrom(AREA_SEEDS[aA] || GLOBAL_SEEDS), yearFrom, yearTo),
        region: aA,
      })
      searches.push({
        term: applyYearHint(randomFrom(AREA_SEEDS[aB] || GLOBAL_SEEDS), yearFrom, yearTo),
        region: aB,
      })
    } else {
      const area = areas[0]
      const seeds = AREA_SEEDS[area] || GLOBAL_SEEDS
      const [sA, sB] = twoDistinct(seeds)
      searches.push({ term: applyYearHint(sA, yearFrom, yearTo), region: area })
      searches.push({ term: applyYearHint(sB, yearFrom, yearTo), region: area })
    }
  }

  // Last.fm expansion: pivot artist → similar artists (infinite graph)
  if (pivot && apiKey) {
    const similar = await lastfmSimilarArtists(pivot, apiKey)
    const top = similar.slice(0, 3)
    const region = useAll ? seedToRegion(pivot) : areas[0]
    for (const artist of top) {
      searches.push({ term: applyYearHint(artist, yearFrom, yearTo), region })
    }
  } else if (apiKey) {
    // No pivot yet: use tag-based discovery for variety
    const tags = useAll
      ? GLOBAL_LASTFM_TAGS
      : (AREA_LASTFM_TAGS[areas[0]] || GLOBAL_LASTFM_TAGS)
    const tag = randomFrom(tags)
    const tagArtists = await lastfmTagArtists(tag, apiKey)
    if (tagArtists.length > 0) {
      const artist = randomFrom(tagArtists)
      const region = useAll ? 'World' : areas[0]
      searches.push({ term: applyYearHint(artist, yearFrom, yearTo), region })
    }
  }

  // ── Parallel iTunes calls ────────────────────────────────────────────────

  const batches = await Promise.all(
    searches.map(s => fetchFromTerm(s.term, s.region, yearFrom, yearTo, excludeSet))
  )

  // Merge, deduplicate, shuffle
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

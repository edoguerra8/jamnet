import { AREA_LASTFM_TAGS, GLOBAL_LASTFM_TAGS } from './genres'

// ── Seed data ─────────────────────────────────────────────────────────────────

export const AREA_SEEDS: Record<string, string[]> = {
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

export const GLOBAL_SEEDS = [
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

// ── MusicBrainz country mappings ──────────────────────────────────────────────

export const MB_COUNTRIES: Record<string, string[]> = {
  'West Africa':    ['Mali', 'Nigeria', 'Ghana', 'Senegal', 'Guinea', 'Ivory Coast', 'Burkina Faso'],
  'North Africa':   ['Morocco', 'Egypt', 'Algeria', 'Tunisia', 'Libya'],
  'Middle East':    ['Turkey', 'Lebanon', 'Iran', 'Iraq', 'Syria', 'Israel'],
  'South Asia':     ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal'],
  'East Asia':      ['Japan', 'South Korea', 'China', 'Mongolia'],
  'Southeast Asia': ['Indonesia', 'Thailand', 'Vietnam', 'Philippines', 'Cambodia'],
  'Latin America':  ['Colombia', 'Argentina', 'Brazil', 'Mexico', 'Cuba', 'Peru', 'Chile', 'Venezuela'],
  'Caribbean':      ['Jamaica', 'Trinidad and Tobago', 'Haiti', 'Barbados'],
  'Europe':         ['Spain', 'Portugal', 'Ireland', 'Greece', 'France', 'Italy', 'Germany', 'Romania', 'Bulgaria'],
  'North America':  ['United States', 'Canada'],
  'Oceania':        ['Australia', 'New Zealand'],
}

const ALL_MB_COUNTRIES = Object.values(MB_COUNTRIES).flat()

// ── iTunes extra country stores per area ──────────────────────────────────────

const AREA_ITUNES_CC: Record<string, string[]> = {
  'West Africa':    ['FR', 'ZA', 'GB'],
  'North Africa':   ['FR', 'MA'],
  'Middle East':    ['TR', 'SA', 'GB'],
  'South Asia':     ['IN', 'GB', 'US'],
  'East Asia':      ['JP', 'KR', 'AU'],
  'Southeast Asia': ['SG', 'AU', 'ID'],
  'Latin America':  ['BR', 'MX', 'CO', 'AR'],
  'Caribbean':      ['JM', 'GB', 'CA'],
  'Europe':         ['FR', 'DE', 'ES', 'IT', 'PT'],
  'North America':  ['CA', 'GB'],
  'Oceania':        ['AU', 'NZ'],
}

const GLOBAL_ITUNES_CC = ['FR', 'DE', 'JP', 'BR', 'AU', 'MX', 'GB', 'ES', 'IT', 'CA']

// ── Region inference ──────────────────────────────────────────────────────────

export function seedToRegion(seed: string): string {
  const s = seed.toLowerCase()
  if (/mali|nigeria|ghana|senegal|afrobeat|highlife|mbalax|wassoulou|guinea|jùjú/.test(s)) return 'West Africa'
  if (/morocco|egypt|algeria|tunisia|amazigh|berber|gnawa/.test(s)) return 'North Africa'
  if (/arabic|turkish|persian|lebanese|khaleeji|gulf|oud|maqam|yemeni|armenian|kurdish|israel/.test(s)) return 'Middle East'
  if (/india|pakistan|bengali|bollywood|qawwali|raga|sufi|carnatic|nusrat|hindi|punjabi|ghazal/.test(s)) return 'South Asia'
  if (/japan|korean|chinese|okinawa|mongol|enka|taiwanese|gayageum/.test(s)) return 'East Asia'
  if (/indonesia|thai|vietnam|filipino|cambodia|khmer|gamelan|burmese|javanese/.test(s)) return 'Southeast Asia'
  if (/colombia|argentina|brazil|bossa|tropicalia|cumbia|tango|andean|jobim|caetano|vallenato|forró|samba|joropo|mpb/.test(s)) return 'Latin America'
  if (/jamaica|cuba|calypso|trinidad|soca|haiti|reggae|salsa|puerto|merengue|zouk|rocksteady/.test(s)) return 'Caribbean'
  if (/spain|portugal|ireland|greek|balkan|fado|flamenco|celtic|rebetiko|chanson|canzone|klezmer|georgian|sephardic/.test(s)) return 'Europe'
  if (/blues|new orleans|appalachian|soul|funk|country|bluegrass|stax|mississippi|gospel|cajun|zydeco/.test(s)) return 'North America'
  if (/australia|māori|pacific|hawaiian|polynesian|aboriginal|tongan|samoan/.test(s)) return 'Oceania'
  return 'World'
}

export function countryToRegion(country: string): string {
  for (const [region, countries] of Object.entries(MB_COUNTRIES)) {
    if (countries.includes(country)) return region
  }
  return 'World'
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Strategy format ───────────────────────────────────────────────────────────
// s::term::region            — iTunes US search
// i::term::CC::region        — iTunes specific country store
// t::tag::page::region       — Last.fm tag top artists (page N) → iTunes
// a::artist::region          — iTunes artist search (+ similar artists)
// m::country::offset         — MusicBrainz country artists → iTunes

export function buildInitialStrategies(
  areas: string[],
  yearFrom: number,
  yearTo: number,
): string[] {
  const useAll = areas.length === 0 || areas.includes('All')
  const hint = yearTo - yearFrom < 20
    ? ` ${Math.floor((yearFrom + yearTo) / 2 / 10) * 10}s`
    : ''
  const strats: string[] = []

  if (useAll) {
    for (const seed of GLOBAL_SEEDS) {
      strats.push(`s::${seed}${hint}::World`)
    }
    for (const seed of shuffle(GLOBAL_SEEDS).slice(0, 15)) {
      for (const cc of shuffle(GLOBAL_ITUNES_CC).slice(0, 2)) {
        strats.push(`i::${seed}${hint}::${cc}::World`)
      }
    }
    for (const tag of GLOBAL_LASTFM_TAGS) {
      for (let p = 1; p <= 4; p++) {
        strats.push(`t::${tag}::${p}::World`)
      }
    }
    for (const country of shuffle(ALL_MB_COUNTRIES).slice(0, 18)) {
      for (let off = 0; off <= 50; off += 25) {
        strats.push(`m::${country}::${off}`)
      }
    }
  } else {
    for (const area of areas) {
      const seeds = AREA_SEEDS[area] || GLOBAL_SEEDS
      for (const seed of seeds) {
        strats.push(`s::${seed}${hint}::${area}`)
      }
      const ccs = AREA_ITUNES_CC[area] || GLOBAL_ITUNES_CC
      for (const seed of shuffle(seeds).slice(0, Math.min(seeds.length, 8))) {
        for (const cc of ccs.slice(0, 2)) {
          strats.push(`i::${seed}${hint}::${cc}::${area}`)
        }
      }
      const tags = AREA_LASTFM_TAGS[area] || GLOBAL_LASTFM_TAGS
      for (const tag of tags) {
        for (let p = 1; p <= 4; p++) {
          strats.push(`t::${tag}::${p}::${area}`)
        }
      }
      const mbCountries = MB_COUNTRIES[area] || []
      for (const country of mbCountries) {
        for (let off = 0; off <= 50; off += 25) {
          strats.push(`m::${country}::${off}`)
        }
      }
    }
  }

  return shuffle(strats)
}

export function strategiesFromArtists(artists: string[], region: string): string[] {
  return artists.map(a => `a::${a}::${region}`)
}

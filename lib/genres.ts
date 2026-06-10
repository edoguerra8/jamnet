export const MACRO_GENRES = [
  'World', 'Jazz', 'Blues', 'Soul', 'Folk', 'Rock', 'Classical', 'Electronic', 'Pop',
] as const

export type MacroGenre = typeof MACRO_GENRES[number]

const GENRE_MAP: Record<string, MacroGenre> = {
  // World
  'World': 'World', 'World Music': 'World', 'Afrobeat': 'World',
  'African': 'World', 'Reggae': 'World', 'Latin': 'World', 'Latino': 'World',
  'International': 'World', 'Dancehall': 'World', 'Ska': 'World',

  // Jazz
  'Jazz': 'Jazz', 'Jazz+Blues': 'Jazz', 'Easy Listening': 'Jazz',
  'Bossa Nova': 'Jazz', 'Big Band': 'Jazz',

  // Blues
  'Blues': 'Blues',

  // Soul
  'Soul': 'Soul', 'R&B/Soul': 'Soul', 'R&B': 'Soul',
  'Funk': 'Soul', 'Gospel': 'Soul', 'Urban Contemporary': 'Soul', 'Hip-Hop/Rap': 'Soul',

  // Folk
  'Folk': 'Folk', 'Country': 'Folk', 'Bluegrass': 'Folk',
  'Americana': 'Folk', 'Singer/Songwriter': 'Folk', 'Vocal': 'Folk',

  // Rock
  'Rock': 'Rock', 'Alternative': 'Rock', 'Indie Rock': 'Rock',
  'Punk': 'Rock', 'Metal': 'Rock', 'Hard Rock': 'Rock',

  // Classical
  'Classical': 'Classical', 'Opera': 'Classical', 'Chamber Music': 'Classical',
  'Orchestral': 'Classical',

  // Electronic
  'Electronic': 'Electronic', 'Dance': 'Electronic', 'Techno': 'Electronic',
  'House': 'Electronic', 'Ambient': 'Electronic', 'Electronica': 'Electronic',

  // Pop
  'Pop': 'Pop', 'Soundtrack': 'Pop',
}

export function getMacroGenre(iTunesGenre: string): MacroGenre {
  return GENRE_MAP[iTunesGenre] ?? 'World'
}

// Last.fm tags per area — usati per scoprire artisti via Last.fm API
export const AREA_LASTFM_TAGS: Record<string, string[]> = {
  'West Africa': ['afrobeat', 'highlife', 'afropop', 'mbalax', 'juju music'],
  'North Africa': ['gnawa', 'rai', 'arabic', 'north africa'],
  'Middle East': ['arabic music', 'turkish folk', 'persian classical', 'oud'],
  'South Asia': ['indian classical', 'qawwali', 'bollywood', 'carnatic'],
  'East Asia': ['japanese traditional', 'korean traditional', 'chinese folk', 'enka'],
  'Southeast Asia': ['gamelan', 'thai folk', 'vietnamese folk'],
  'Latin America': ['bossa nova', 'tropicalia', 'cumbia', 'tango', 'samba'],
  'Caribbean': ['reggae', 'ska', 'calypso', 'cuban'],
  'Europe': ['folk', 'fado', 'flamenco', 'chanson', 'celtic'],
  'North America': ['blues', 'jazz', 'soul', 'folk', 'bluegrass'],
  'Oceania': ['pacific island', 'australian folk', 'maori'],
}

export const GLOBAL_LASTFM_TAGS = [
  'world music', 'folk', 'jazz', 'blues', 'soul', 'afrobeat',
  'bossa nova', 'flamenco', 'reggae', 'fado', 'qawwali',
]

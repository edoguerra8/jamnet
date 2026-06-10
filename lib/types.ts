export interface Track {
  id: string
  title: string
  artist: string
  album: string
  artworkUrl: string | null
  previewUrl: string | null
  year: number
  genre: string
  region: string
  macroGenre: string
}

export interface Compilation {
  id: string
  name: string
  tracks: Track[]
  createdAt: number
}

// Server-side discovery: a single curated flow — "a DJ set that travels the world".
// Same vibe, different corner of the world: consecutive tracks stay musically close
// (era / genre family) but always change country, with gentle region balancing and
// anchored-discovery curation (mostly gems, the occasional recognizable anchor).

export const MACRO_AREAS = [
  'West Africa', 'North Africa', 'Middle East', 'South Asia', 'East Asia', 'Southeast Asia',
  'Latin America', 'Caribbean', 'Europe', 'North America', 'Oceania',
] as const

// Approx. playable tracks per region (catalog snapshot 2026-06-19). Used only for the
// gentle region balance (shares ∝ √count), so an estimate is fine — refresh after a big
// catalog rebuild. Avoids an expensive exact COUNT on a ~400k-row table per request.
export const REGION_PLAYABLE: Record<string, number> = {
  'West Africa': 1651, 'North Africa': 536, 'Middle East': 2846, 'South Asia': 864,
  'East Asia': 2592, 'Southeast Asia': 1717, 'Latin America': 4738, 'Caribbean': 2768,
  'Europe': 23547, 'North America': 1381, 'Oceania': 2339,
}

// Group raw tags into families so the scheduler can keep continuity (same/adjacent
// family) without locking onto one exact tag. Lowercased matching; first hit wins.
const GENRE_FAMILIES: Record<string, string[]> = {
  metal:      ['metal', 'heavy metal', 'black metal', 'death metal', 'power metal', 'progressive metal', 'thrash', 'doom', 'metalcore'],
  rock:       ['rock', 'classic rock', 'hard rock', 'punk', 'indie', 'alternative', 'psychedelic', 'garage', 'soft rock', 'rock/pop', 'grunge', 'post-rock'],
  pop:        ['pop', 'synthpop', 'dance pop', 'electropop', 'k-pop', 'j-pop', 'teen pop', 'pop rock', 'eurovision'],
  electronic: ['electronic', 'electronica', 'house', 'techno', 'trance', 'edm', 'ambient', 'idm', 'drum and bass', 'dubstep', 'synth', 'downtempo'],
  hiphop:     ['hip hop', 'hip-hop', 'rap', 'trap', 'grime', 'drill', 'trap latino'],
  jazzsoul:   ['jazz', 'blues', 'swing', 'bebop', 'soul', 'funk', 'rhythm and blues', 'r&b', 'rnb', 'gospel', 'motown'],
  folk:       ['folk', 'traditional', 'world', 'field recording', 'acoustic', 'singer-songwriter', 'country', 'americana', 'bluegrass', 'celtic', 'gypsy'],
  classical:  ['classical', 'baroque', 'romantic', 'opera', 'orchestral', 'concerto', 'symphony', 'contemporary classical', 'piano', 'choral'],
  latin:      ['latin', 'salsa', 'reggaeton', 'cumbia', 'bachata', 'samba', 'bossa nova', 'tango', 'merengue', 'pagode', 'sertanejo', 'mpb', 'musica brasileira', 'argentina'],
  afrocarib:  ['reggae', 'dancehall', 'ska', 'afrobeats', 'afrobeat', 'afropop', 'highlife', 'soca', 'dub', 'zouk', 'naija'],
}

const TAG_TO_FAMILY = new Map<string, string>()
for (const [fam, tags] of Object.entries(GENRE_FAMILIES)) for (const t of tags) TAG_TO_FAMILY.set(t, fam)

// The musical family of a track, from the first tag we recognize (else null).
export function familyOf(tags: string[] | null | undefined): string | null {
  if (!tags) return null
  for (const t of tags) {
    const f = TAG_TO_FAMILY.get(String(t).toLowerCase())
    if (f) return f
  }
  return null
}

// Anchored-discovery weighting: favor the mid band (gems), compress megastars so they
// stay present but don't dominate, damp tracks with poor metadata (no tags).
export function curationWeight(weight: number, hasTags: boolean): number {
  let w = Math.max(1, Math.min(100, weight || 1))
  if (w > 65) w = 65 + (w - 65) * 0.15
  let s = Math.sqrt(w)
  if (!hasTags) s *= 0.4
  return s
}

// Gentle region balance: target share per area ∝ sqrt(playable count).
export function regionShares(counts: Record<string, number>, areas: string[]): Record<string, number> {
  const sq: Record<string, number> = {}
  let total = 0
  for (const a of areas) { const s = Math.sqrt(Math.max(1, counts[a] || 1)); sq[a] = s; total += s }
  const shares: Record<string, number> = {}
  for (const a of areas) shares[a] = total > 0 ? sq[a] / total : 1 / areas.length
  return shares
}

// ── DJ scheduler ─────────────────────────────────────────────────────────────

export interface Candidate {
  row: Record<string, unknown>
  id: string
  country: string
  area: string
  artist: string
  family: string | null
  year: number
  tags: string[]
  cw: number   // curation weight
}

export interface RecentContext {
  prev?: { country: string; area: string; family: string | null; year: number; tags: string[] }
  countries: string[]   // recently played countries (oldest→newest)
  artists: string[]     // recently played artists
}

const COUNTRY_GAP = 5    // don't repeat a country within this many tracks
const ARTIST_GAP  = 15   // don't repeat an artist within this many tracks
const FAMILY_RUN_CAP = 3 // after this many same-family in a row, push for a change

interface Prev { country: string; area: string; family: string | null; year: number; tags: string[] }

// Musical-smoothness + curation score for choosing the next track after `prev`.
function trackScore(c: Candidate, prev: Prev | null, familyRun: number): number {
  let s = c.cw
  if (prev) {
    if (c.family && prev.family) s += c.family === prev.family ? 2.5 : 0.5
    const shared = c.tags.filter(t => prev.tags.includes(t)).length
    s += Math.min(shared, 2) * 0.8
    if (prev.year && c.year) s += Math.max(0, 1.5 - Math.abs(c.year - prev.year) / 15)
    if (c.family && c.family === prev.family && familyRun >= FAMILY_RUN_CAP) s -= 3
  }
  return s + Math.random() * 0.6
}

// Pick & remove the best constraint-satisfying track from a list. Constraints relax
// progressively (so the flow never stalls): country-diversity first, then artist gap,
// then the no-same-country-as-previous rule.
function pickValid(
  list: Candidate[], prev: Prev | null,
  recentCountries: string[], recentArtists: string[], familyRun: number, enforceCountry: boolean,
): Candidate | null {
  for (let relax = 0; relax <= 2; relax++) {
    let bestI = -1, bestS = -Infinity
    for (let i = 0; i < list.length; i++) {
      const c = list[i]
      if (enforceCountry && relax < 2 && prev && c.country === prev.country) continue
      if (relax < 1) {
        if (enforceCountry && recentCountries.slice(-COUNTRY_GAP).includes(c.country)) continue
        if (recentArtists.slice(-ARTIST_GAP).includes(c.artist)) continue
      }
      const s = trackScore(c, prev, familyRun)
      if (s > bestS) { bestS = s; bestI = i }
    }
    if (bestI >= 0) return list.splice(bestI, 1)[0]
  }
  return null
}

// Order the pool into a single curated flow: a "DJ set that travels".
// Region path (shares given): allocate per-region slots ∝ share (gentle balance),
// then interleave so the same region never lands back-to-back and fill each slot with
// the musically-smoothest track that changes country. Country/artist path (no shares):
// a single bucket ordered purely by smoothness, with no country constraint.
export function buildSequence(
  cands: Candidate[],
  target: number,
  shares: Record<string, number>,
  recent: RecentContext,
): Candidate[] {
  const out: Candidate[] = []
  const recentCountries = [...recent.countries]
  const recentArtists = [...recent.artists]
  let prev: Prev | null = recent.prev ?? null
  let familyRun = 0

  const advance = (chosen: Candidate) => {
    familyRun = prev && chosen.family && prev.family === chosen.family ? familyRun + 1 : (chosen.family ? 1 : 0)
    prev = { country: chosen.country, area: chosen.area, family: chosen.family, year: chosen.year, tags: chosen.tags }
    recentCountries.push(chosen.country)
    recentArtists.push(chosen.artist)
    out.push(chosen)
  }

  const areas = Object.keys(shares)

  // Country / artist filter: one bucket, smoothness only (no country diversity).
  if (areas.length === 0) {
    const pool = [...cands]
    while (out.length < target && pool.length > 0) {
      const c = pickValid(pool, prev, recentCountries, recentArtists, familyRun, false)
      if (!c) break
      advance(c)
    }
    return out
  }

  // Group candidates by region.
  const byArea = new Map<string, Candidate[]>()
  for (const a of areas) byArea.set(a, [])
  for (const c of cands) byArea.get(c.area)?.push(c)

  // Slot allocation ∝ share, capped by what's actually available.
  const slots: Record<string, number> = {}
  let assigned = 0
  for (const a of areas) {
    const s = Math.min(byArea.get(a)!.length, Math.round((shares[a] || 0) * target))
    slots[a] = s; assigned += s
  }
  // Top up to target, handing leftover slots to the largest-share areas that still have stock.
  const byShareDesc = [...areas].sort((x, y) => (shares[y] || 0) - (shares[x] || 0))
  let guard = 0
  while (assigned < target && guard++ < target * 2) {
    let added = false
    for (const a of byShareDesc) {
      if (slots[a] < byArea.get(a)!.length) { slots[a]++; assigned++; added = true; if (assigned >= target) break }
    }
    if (!added) break
  }

  // Interleave: each position takes from the region with the most remaining slots,
  // preferring a region different from the previous one.
  let prevArea: string | null = recent.prev?.area ?? null
  guard = 0
  while (out.length < target && guard++ < target * 4) {
    const avail = areas.filter(a => slots[a] > 0 && byArea.get(a)!.length > 0)
    if (avail.length === 0) break
    let choices = avail.filter(a => a !== prevArea)
    if (choices.length === 0) choices = avail
    let area = choices[0], best = -Infinity
    for (const a of choices) { const v = slots[a] + Math.random() * 0.5; if (v > best) { best = v; area = a } }

    const chosen = pickValid(byArea.get(area)!, prev, recentCountries, recentArtists, familyRun, true)
    if (!chosen) { slots[area] = 0; continue }   // region can't satisfy constraints → release its slots
    slots[area]--
    prevArea = area
    advance(chosen)
  }

  return out
}

// Build a Candidate from a DB row.
export function toCandidate(row: Record<string, unknown>): Candidate {
  const tags = (row.tags as string[]) || []
  return {
    row,
    id: String(row.id),
    country: String(row.country || ''),
    area: String(row.macro_area || ''),
    artist: String(row.artist_name || ''),
    family: familyOf(tags),
    year: Number(row.year) || 0,
    tags,
    cw: curationWeight(Number(row.weight) || 1, tags.length > 0),
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { Track, FlowMode } from '@/lib/types'
import { dbRowToTrack, TRACK_COLUMNS } from '@/lib/tracks'

const BATCH_SIZE = 30
const POOL_SIZE = 300       // random window into catalog depth, sampled in JS
const VARIETY_WINDOW = 8    // last N tracks fed in from the session for continuity
const RAMP_LENGTH = 15      // session depth over which the feel opens up

// ── Tunable knobs ───────────────────────────────────────────────────────────
// Everything that shapes the "feel" of discovery lives here so it can be tuned
// in one place. interest = wQuality·Q + wGem·G + wDistinct·D (each 0..1).
const CONFIG = {
  // What makes a track "interesting": popularity/quality, the gem signal (a
  // track punching above its weight), and distinctiveness (rare tags for its area).
  wQuality:  0.55,
  wGem:      0.20,
  wDistinct: 0.25,
  // Batch composition across interest strata [high, mid, long-tail]. Shifts toward
  // the long tail deeper in a session and in Whirl — so range is guaranteed from
  // track #1, not only in long sessions.
  mixShallow: [0.45, 0.35, 0.20] as [number, number, number],
  mixDeep:    [0.30, 0.33, 0.37] as [number, number, number],
  // Softmax temperature within a stratum: higher = wider / more surprising.
  tempShallow: 0.18,
  tempDeep:    0.40,
  // Diversity (MMR): how hard to push away from recently-seen artist/country/tags.
  lambda: 0.6,
  // Artist cooldown: avoid repeating an artist within this many picks (per batch).
  artistCooldown: 6,
}

// Adjacent macro-areas for Course mode — biased toward nearby regions
const ADJACENT: Record<string, string[]> = {
  'West Africa':    ['North Africa', 'Caribbean', 'Latin America'],
  'North Africa':   ['West Africa', 'Middle East', 'Europe'],
  'Middle East':    ['North Africa', 'South Asia', 'Europe'],
  'South Asia':     ['Middle East', 'East Asia', 'Southeast Asia'],
  'East Asia':      ['South Asia', 'Southeast Asia', 'Oceania'],
  'Southeast Asia': ['East Asia', 'South Asia', 'Oceania'],
  'Latin America':  ['Caribbean', 'North America', 'West Africa'],
  'Caribbean':      ['Latin America', 'North America', 'West Africa'],
  'Europe':         ['North Africa', 'Middle East', 'North America'],
  'North America':  ['Europe', 'Caribbean', 'Latin America'],
  'Oceania':        ['East Asia', 'Southeast Asia'],
}

function isWhirl(mode: FlowMode) {
  return mode === 'whirl' || mode === 'vortice'
}

const ALL_DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]

interface Filters {
  targetAreas: string[]
  decades: number[]
  includeNow: boolean
  country: string | null
  artistMbId: string | null
  artistName: string | null
  exclude: string[]
}

// ── Scoring helpers ──────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

// A picked/seeded entry used by the diversity (MMR) check.
interface WindowEntry {
  artist: string | null
  country: string | null
  tags: Set<string>
}

function similarity(c: WindowEntry, r: WindowEntry): number {
  const a  = c.artist  && r.artist  && c.artist  === r.artist  ? 1 : 0
  const co = c.country && r.country && c.country === r.country ? 1 : 0
  const j  = jaccard(c.tags, r.tags)
  return Math.min(1, 0.5 * a + 0.3 * co + 0.7 * j)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const areas: string[]   = Array.isArray(body.areas) ? body.areas : []
    // decades can include numeric values (1950…2020) and the string 'now'
    const rawDecades: (string | number)[] = Array.isArray(body.decades) ? body.decades : []
    const includeNow = rawDecades.includes('now')
    const decades: number[] = rawDecades
      .map(Number)
      .filter((d: number) => ALL_DECADES.includes(d))

    const country: string | null    = typeof body.country === 'string' && body.country ? body.country : null
    const artistMbId: string | null = typeof body.artistMbId === 'string' && body.artistMbId ? body.artistMbId : null
    const artistName: string | null = typeof body.artistName === 'string' && body.artistName ? body.artistName : null
    // Only keep well-formed UUIDs in the exclude set — these are interpolated into
    // a PostgREST filter string below, so unvalidated input must not reach it.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const exclude: string[] = (Array.isArray(body.exclude) ? body.exclude : [])
      .filter((id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id))
      .slice(-400)
    const mode: FlowMode    = (['whirl','vortice'].includes(body.mode)) ? body.mode : 'course'
    const currentArea: string | null = body.currentArea || null
    const sessionDepth: number = Number(body.sessionDepth) || 0
    const debug = Boolean(body.debug)

    // Tags from the last few session tracks — seed the diversity window so the
    // first picks of a new batch don't echo the end of the previous one.
    const sessionTagsList: string[][] = Array.isArray(body.sessionTags) ? body.sessionTags : []
    const seedWindow: WindowEntry[] = sessionTagsList.slice(-VARIETY_WINDOW).map(tags => ({
      artist: null,
      country: null,
      tags: new Set((tags || []).map(String)),
    }))

    const sb = createServiceClient()

    // Build area filter (skipped when narrowing to a country or an artist)
    let targetAreas: string[] = []
    if (!country && !artistMbId && !artistName) {
      if (areas.length === 0 || areas.includes('All')) {
        if (!isWhirl(mode) && currentArea) {
          // Course: prefer current area, allow adjacent
          targetAreas = [currentArea, ...(ADJACENT[currentArea] || [])]
        }
      } else {
        targetAreas = areas
      }
    }

    const filters: Filters = { targetAreas, decades, includeNow, country, artistMbId, artistName, exclude }

    // Single source of truth for the filtered candidate set. Returns a FRESH
    // query each call (supabase query objects can't be reused after await), so
    // the primary and wrap legs of the random draw share identical filters.
    function buildBaseQuery() {
      // Quality floor (resa sonora): playable AND has artwork.
      // `any` here breaks the supabase query-builder's deep conditional-reassignment
      // type instantiation (TS2589); the result rows are cast explicitly below.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = sb.from('tracks')
        .select(TRACK_COLUMNS)
        .or('apple_music_id.not.is.null,itunes_preview_url.not.is.null')
        .not('artwork_url', 'is', null)

      // Decade / "Now" filter
      if (filters.includeNow && filters.decades.length === 0) {
        query = query.eq('is_new_release', true)
      } else if (filters.includeNow) {
        const sorted = [...filters.decades].sort((a, b) => a - b)
        const yearFilter = sorted.map(d => `and(year.gte.${d},year.lte.${d + 9})`).join(',')
        query = query.or(`is_new_release.eq.true,${yearFilter}`)
      } else if (filters.decades.length > 0 && filters.decades.length < ALL_DECADES.length) {
        const sorted = [...filters.decades].sort((a, b) => a - b)
        const contiguous = sorted.every((d, i) => i === 0 || d - sorted[i - 1] === 10)
        if (contiguous) {
          query = query.gte('year', sorted[0]).lte('year', sorted[sorted.length - 1] + 9)
        } else {
          query = query.or(sorted.map(d => `and(year.gte.${d},year.lte.${d + 9})`).join(','))
        }
      } else {
        query = query.gte('year', 1950)
      }

      if (filters.country)    query = query.eq('country', filters.country)
      if (filters.artistMbId) query = query.eq('artist_mb_id', filters.artistMbId)
      else if (filters.artistName) query = query.eq('artist_name', filters.artistName)

      if (filters.targetAreas.length > 0) {
        query = query.in('macro_area', filters.targetAreas)
      }

      if (filters.exclude.length > 0) {
        query = query.not('id', 'in', `(${filters.exclude.map(id => `"${id}"`).join(',')})`)
      }

      return query
    }

    // Depth: draw a random window via the indexed `rand` column with wraparound,
    // so each request samples a different slice of the catalog (not the head).
    const pivot = Math.random()
    const primary = await buildBaseQuery()
      .gte('rand', pivot).order('rand', { ascending: true }).limit(POOL_SIZE)
    let pool: Row[] = (primary.data as Row[]) ?? []

    if (!primary.error && pool.length < POOL_SIZE) {
      const wrap = await buildBaseQuery()
        .lt('rand', pivot).order('rand', { ascending: true }).limit(POOL_SIZE - pool.length)
      pool = pool.concat((wrap.data as Row[]) ?? [])
    }

    if (primary.error || pool.length === 0) {
      return NextResponse.json({ tracks: [] })
    }

    // ── Interest score ───────────────────────────────────────────────────────
    // Q: quality/popularity (existing quality_score, normalized by pool max).
    // G: gem — per-track listeners standing out (track_listeners, when present).
    // D: distinctiveness — rare tags within this pool (pool-local IDF).
    const tagDf = new Map<string, number>()
    for (const r of pool) {
      for (const t of new Set((r.tags as string[]) || [])) {
        tagDf.set(t, (tagDf.get(t) || 0) + 1)
      }
    }
    const idf = (t: string) => Math.log(pool.length / (1 + (tagDf.get(t) || 0)))

    const maxQ = Math.max(1, ...pool.map(r => Number(r.quality_score) || Number(r.weight) || 1))
    const maxTl = Math.max(1, ...pool.map(r => Math.log10((Number(r.track_listeners) || 0) + 10)))
    let maxIdf = 0
    for (const r of pool) {
      const tags = (r.tags as string[]) || []
      const v = tags.length ? tags.reduce((s, t) => s + idf(t), 0) / tags.length : 0
      if (v > maxIdf) maxIdf = v
    }
    maxIdf = Math.max(1e-6, maxIdf)

    const interestOf = (r: Row): number => {
      const q = (Number(r.quality_score) || Number(r.weight) || 1) / maxQ
      const g = Math.log10((Number(r.track_listeners) || 0) + 10) / maxTl
      const tags = (r.tags as string[]) || []
      const d = tags.length ? (tags.reduce((s, t) => s + idf(t), 0) / tags.length) / maxIdf : 0
      return CONFIG.wQuality * q + CONFIG.wGem * g + CONFIG.wDistinct * d
    }

    const scored = pool.map(r => ({ row: r, interest: interestOf(r) }))

    // ── Strata: split the scored pool into high / mid / long-tail thirds ──────
    scored.sort((a, b) => b.interest - a.interest)
    const third = Math.ceil(scored.length / 3)
    const strata = [
      scored.slice(0, third),            // 0 = high
      scored.slice(third, 2 * third),    // 1 = mid
      scored.slice(2 * third),           // 2 = long-tail
    ]

    // Session position drives how far we open up. Whirl starts near the surprise end.
    let t = Math.max(0, Math.min(1, sessionDepth / RAMP_LENGTH))
    if (isWhirl(mode)) t = Math.max(t, 0.7)
    const mix = [0, 1, 2].map(i => lerp(CONFIG.mixShallow[i], CONFIG.mixDeep[i], t)) as [number, number, number]
    const temp = lerp(CONFIG.tempShallow, CONFIG.tempDeep, t)

    // Target counts per stratum (largest-remainder rounding to hit BATCH_SIZE).
    const target = BATCH_SIZE
    const raw = mix.map(m => m * target)
    const counts = raw.map(Math.floor)
    let assigned = counts.reduce((s, c) => s + c, 0)
    const rema = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac)
    for (let k = 0; assigned < target && k < rema.length; k++, assigned++) counts[rema[k % rema.length].i]++

    // Build an interleaved slot order (round-robin) so the batch never front-loads
    // one stratum — range is felt continuously, not in a block at the end.
    const remainingCounts = [...counts]
    const slots: number[] = []
    while (slots.length < target && remainingCounts.some(c => c > 0)) {
      for (let s = 0; s < 3; s++) {
        if (remainingCounts[s] > 0) { slots.push(s); remainingCounts[s]-- }
        if (slots.length >= target) break
      }
    }

    // ── Stochastic selection with MMR diversity + artist cooldown ─────────────
    const window: WindowEntry[] = [...seedWindow]
    const recentArtists: (string | null)[] = []
    const picked: Row[] = []

    const entryOf = (r: Row): WindowEntry => ({
      artist:  (r.artist_mb_id as string) || (r.artist_name as string) || null,
      country: (r.country as string) || null,
      tags:    new Set((r.tags as string[]) || []),
    })

    function simToWindow(e: WindowEntry): number {
      let m = 0
      for (const w of window) { const s = similarity(e, w); if (s > m) m = s }
      return m
    }

    function softmaxPick(cands: { row: Row; interest: number }[], allowRepeatArtist: boolean): number {
      // MMR-adjusted scores, then softmax sampling at the current temperature.
      const cooldown = new Set(recentArtists.slice(-CONFIG.artistCooldown).filter(Boolean) as string[])
      const adj = cands.map(c => {
        const e = entryOf(c.row)
        const artistId = e.artist
        const blocked = !allowRepeatArtist && artistId !== null && cooldown.has(artistId)
        const score = c.interest - CONFIG.lambda * simToWindow(e)
        return { score, blocked }
      })
      const usable = adj.some(a => !a.blocked)
      const maxScore = Math.max(...adj.map((a, i) => (usable && a.blocked ? -Infinity : a.score)))
      let total = 0
      const weights = adj.map(a => {
        if (usable && a.blocked) return 0
        const w = Math.exp((a.score - maxScore) / temp)
        total += w
        return w
      })
      let rnd = Math.random() * total
      for (let i = 0; i < weights.length; i++) { rnd -= weights[i]; if (rnd <= 0) return i }
      return weights.findIndex(w => w > 0)
    }

    function pickFromStratum(s: number): boolean {
      // Try the target stratum, then fall back outward so a slot is never wasted.
      const order = [s, (s + 1) % 3, (s + 2) % 3]
      for (const idx of order) {
        const st = strata[idx]
        if (st.length === 0) continue
        let i = softmaxPick(st, false)
        if (i < 0) i = softmaxPick(st, true) // every candidate on cooldown → relax
        if (i < 0) i = 0
        const chosen = st.splice(i, 1)[0]
        const e = entryOf(chosen.row)
        picked.push(chosen.row)
        window.push(e)
        if (window.length > 12) window.shift()
        recentArtists.push(e.artist)
        return true
      }
      return false
    }

    for (const s of slots) {
      if (picked.length >= BATCH_SIZE) break
      if (!pickFromStratum(s)) break
    }

    const tracks: Track[] = picked.map(dbRowToTrack)

    if (debug) {
      const artists = new Set(picked.map(r => (r.artist_mb_id as string) || (r.artist_name as string)))
      const areasSeen = new Set(picked.map(r => r.macro_area as string))
      const interests = picked.map(interestOf).sort((a, b) => a - b)
      return NextResponse.json({
        tracks,
        debug: {
          poolSize: pool.length,
          strataSizes: strata.map(s => s.length),
          mix, temp, t,
          batch: picked.length,
          distinctArtists: artists.size,
          distinctAreas: areasSeen.size,
          interestMin: interests[0] ?? 0,
          interestMedian: interests[Math.floor(interests.length / 2)] ?? 0,
          interestMax: interests[interests.length - 1] ?? 0,
        },
      })
    }

    return NextResponse.json({ tracks })

  } catch (e) {
    console.error('discover error', e)
    return NextResponse.json({ tracks: [] }, { status: 500 })
  }
}

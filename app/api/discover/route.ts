import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { Track, FlowMode } from '@/lib/types'
import { dbRowToTrack, TRACK_COLUMNS } from '@/lib/tracks'

const BATCH_SIZE = 30
const POOL_SIZE = 300       // random window into catalog depth, sampled in JS
const VARIETY_WINDOW = 8    // last N tracks used for tag-diversity check
const VARIETY_ATTEMPTS = 6  // attempts before relaxing the constraint
const RAMP_LENGTH = 15      // session depth over which anchors → surprises

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

// Returns true if the candidate track shares at least one tag with the session window.
function overlapsWindow(candidateTags: string[], windowTags: Set<string>): boolean {
  if (windowTags.size === 0) return false
  return candidateTags.some(t => windowTags.has(t))
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
    const exclude: string[] = Array.isArray(body.exclude) ? body.exclude.slice(-400) : []
    const mode: FlowMode    = (['whirl','vortice'].includes(body.mode)) ? body.mode : 'course'
    const currentArea: string | null = body.currentArea || null
    const sessionDepth: number = Number(body.sessionDepth) || 0

    // Variety window: tags from the last VARIETY_WINDOW tracks in session
    const sessionTagsList: string[][] = Array.isArray(body.sessionTags) ? body.sessionTags : []
    const windowTags = new Set<string>(
      sessionTagsList.slice(-VARIETY_WINDOW).flat()
    )

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
    let pool: Record<string, unknown>[] = (primary.data as Record<string, unknown>[]) ?? []

    if (!primary.error && pool.length < POOL_SIZE) {
      const wrap = await buildBaseQuery()
        .lt('rand', pivot).order('rand', { ascending: true }).limit(POOL_SIZE - pool.length)
      pool = pool.concat((wrap.data as Record<string, unknown>[]) ?? [])
    }

    if (primary.error || pool.length === 0) {
      return NextResponse.json({ tracks: [] })
    }

    // Explore/exploit ramp: early in a session, sharpen toward high-quality,
    // recognizable anchors (expo > 1); deeper in, flatten so the long tail of
    // good-but-obscure gems gets real probability (expo < 1). Whirl starts near
    // the surprise regime. Depends only on session position — never on user id.
    let t = Math.max(0, Math.min(1, sessionDepth / RAMP_LENGTH))
    if (isWhirl(mode)) t = Math.max(t, 0.7)
    const expo = 2 - 1.4 * t

    function baseScore(r: Record<string, unknown>): number {
      return Number(r.quality_score) || Number(r.weight) || 1
    }

    // Weighted sampling with variety check
    const picked: Record<string, unknown>[] = []
    const remaining = [...pool]

    function weightedPick(candidates: Record<string, unknown>[]): number {
      const totalWeight = candidates.reduce((sum, r) => sum + Math.pow(baseScore(r), expo), 0)
      let rnd = Math.random() * totalWeight
      for (let i = 0; i < candidates.length; i++) {
        rnd -= Math.pow(baseScore(candidates[i]), expo)
        if (rnd <= 0) return i
      }
      return candidates.length - 1
    }

    while (picked.length < BATCH_SIZE && remaining.length > 0) {
      let found = false
      // Try up to VARIETY_ATTEMPTS times to find a tag-diverse candidate
      for (let attempt = 0; attempt < VARIETY_ATTEMPTS && remaining.length > 0; attempt++) {
        const idx = weightedPick(remaining)
        const candidate = remaining[idx]
        const candidateTags = (candidate.tags as string[]) || []

        if (!overlapsWindow(candidateTags, windowTags) || attempt === VARIETY_ATTEMPTS - 1) {
          picked.push(candidate)
          remaining.splice(idx, 1)
          // Extend the variety window with this pick's tags
          candidateTags.forEach(t => windowTags.add(t))
          found = true
          break
        }
        // Move the candidate to the end and try again (simple rotation)
        remaining.splice(idx, 1)
        remaining.push(candidate)
      }
      if (!found) break
    }

    const tracks: Track[] = picked.map(dbRowToTrack)
    return NextResponse.json({ tracks })

  } catch (e) {
    console.error('discover error', e)
    return NextResponse.json({ tracks: [] }, { status: 500 })
  }
}

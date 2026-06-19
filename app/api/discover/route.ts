import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createServiceClient } from '@/lib/db/supabase'
import { Track, FlowMode } from '@/lib/types'
import { dbRowToTrack, TRACK_COLUMNS } from '@/lib/db/tracks'

const BATCH_SIZE = 30
const POOL_SIZE = 300
const VARIETY_WINDOW = 8   // last N tracks used for tag-diversity check
const VARIETY_ATTEMPTS = 6 // attempts before relaxing the constraint
const ALL_DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]

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

// True if the candidate track shares at least one tag with the session window.
function overlapsWindow(candidateTags: string[], windowTags: Set<string>): boolean {
  if (windowTags.size === 0) return false
  return candidateTags.some(t => windowTags.has(t))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const areas: string[] = Array.isArray(body.areas) ? body.areas : []
    const rawDecades: (string | number)[] = Array.isArray(body.decades) ? body.decades : []
    const includeNow = rawDecades.includes('now')
    const decades: number[] = rawDecades.map(Number).filter((d: number) => ALL_DECADES.includes(d))

    const country: string | null    = typeof body.country === 'string' && body.country ? body.country : null
    const artistMbId: string | null = typeof body.artistMbId === 'string' && body.artistMbId ? body.artistMbId : null
    const artistName: string | null = typeof body.artistName === 'string' && body.artistName ? body.artistName : null
    const exclude: string[] = Array.isArray(body.exclude) ? body.exclude : []
    const mode: FlowMode = (['whirl', 'vortice'].includes(body.mode)) ? body.mode : 'course'
    const currentArea: string | null = body.currentArea || null

    // Variety window: tags from the last VARIETY_WINDOW tracks in session
    const sessionTagsList: string[][] = Array.isArray(body.sessionTags) ? body.sessionTags : []
    const windowTags = new Set<string>(sessionTagsList.slice(-VARIETY_WINDOW).flat())

    const sb = createServiceClient()

    // Area filter (skipped when narrowing to a country or an artist)
    let targetAreas: string[] = []
    if (!country && !artistMbId && !artistName) {
      if (areas.length === 0 || areas.includes('All')) {
        if (!isWhirl(mode) && currentArea) {
          targetAreas = [currentArea, ...(ADJACENT[currentArea] || [])]
        }
      } else {
        targetAreas = areas
      }
    }

    // Factory: a fresh query with every filter applied. (The builder executes once,
    // so we rebuild it for the wrap-around fetch.) A track is playable if it has
    // apple_music_id OR an itunes preview.
    const buildBase = () => {
      let q = sb.from('tracks')
        .select(TRACK_COLUMNS)
        .or('apple_music_id.not.is.null,itunes_preview_url.not.is.null')

      if (includeNow && decades.length === 0) {
        q = q.eq('is_new_release', true)
      } else if (includeNow) {
        const sorted = [...decades].sort((a, b) => a - b)
        const yearFilter = sorted.map(d => `and(year.gte.${d},year.lte.${d + 9})`).join(',')
        q = q.or(`is_new_release.eq.true,${yearFilter}`)
      } else if (decades.length > 0 && decades.length < ALL_DECADES.length) {
        const sorted = [...decades].sort((a, b) => a - b)
        const contiguous = sorted.every((d, i) => i === 0 || d - sorted[i - 1] === 10)
        if (contiguous) {
          q = q.gte('year', sorted[0]).lte('year', sorted[sorted.length - 1] + 9)
        } else {
          q = q.or(sorted.map(d => `and(year.gte.${d},year.lte.${d + 9})`).join(','))
        }
      } else {
        q = q.gte('year', 1950)
      }

      if (country) q = q.eq('country', country)
      if (artistMbId) q = q.eq('artist_mb_id', artistMbId)
      else if (artistName) q = q.eq('artist_name', artistName)
      if (targetAreas.length > 0) q = q.in('macro_area', targetAreas)

      return q
    }

    // Random sampling via a uuid cursor: order by id from a random point, wrapping
    // around if we hit the end. Gives a fresh pool every call (uuid v4 ≈ random),
    // so the weighted sampler isn't stuck on one fixed 300-row window.
    const cursor = randomUUID()
    const first = await buildBase().gte('id', cursor).order('id').limit(POOL_SIZE)
    let rows = (first.data as Record<string, unknown>[] | null) ?? []
    if (!first.error && rows.length < POOL_SIZE) {
      const wrap = await buildBase().lt('id', cursor).order('id').limit(POOL_SIZE - rows.length)
      if (!wrap.error && wrap.data) rows = [...rows, ...(wrap.data as Record<string, unknown>[])]
    }

    if (first.error || rows.length === 0) {
      return NextResponse.json({ tracks: [] })
    }

    // Anti-repeat: drop recently-seen ids in JS (kept out of SQL to keep the query small).
    // If everything in the pool was already seen, allow repeats rather than returning nothing.
    const excludeSet = new Set(exclude)
    let pool = rows.filter(r => !excludeSet.has(String(r.id)))
    if (pool.length === 0) pool = rows

    // Weighted sampling with the tag-diversity check
    const picked: Record<string, unknown>[] = []
    const remaining = [...pool]

    function weightedPick(candidates: Record<string, unknown>[]): number {
      const totalWeight = candidates.reduce((sum, r) => sum + (Number(r.weight) || 1), 0)
      let rnd = Math.random() * totalWeight
      for (let i = 0; i < candidates.length; i++) {
        rnd -= Number(candidates[i].weight) || 1
        if (rnd <= 0) return i
      }
      return candidates.length - 1
    }

    while (picked.length < BATCH_SIZE && remaining.length > 0) {
      let found = false
      for (let attempt = 0; attempt < VARIETY_ATTEMPTS && remaining.length > 0; attempt++) {
        const idx = weightedPick(remaining)
        const candidate = remaining[idx]
        const candidateTags = (candidate.tags as string[]) || []

        if (!overlapsWindow(candidateTags, windowTags) || attempt === VARIETY_ATTEMPTS - 1) {
          picked.push(candidate)
          remaining.splice(idx, 1)
          candidateTags.forEach(t => windowTags.add(t))
          found = true
          break
        }
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

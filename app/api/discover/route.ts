import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createServiceClient } from '@/lib/db/supabase'
import { Track } from '@/lib/types'
import { dbRowToTrack, TRACK_COLUMNS } from '@/lib/db/tracks'
import {
  MACRO_AREAS, REGION_PLAYABLE, regionShares, buildSequence, toCandidate, familyOf,
  Candidate, RecentContext,
} from '@/lib/discovery'

const BATCH_SIZE = 30
const POOL_SIZE = 300
const ALL_DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]
const PLAYABLE = 'apple_music_id.not.is.null,itunes_preview_url.not.is.null'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any

// Apply the decade / "Now" filter to a query builder.
function applyDecade(q: Query, decades: number[], includeNow: boolean): Query {
  if (includeNow && decades.length === 0) return q.eq('is_new_release', true)
  if (includeNow) {
    const sorted = [...decades].sort((a, b) => a - b)
    return q.or(`is_new_release.eq.true,${sorted.map(d => `and(year.gte.${d},year.lte.${d + 9})`).join(',')}`)
  }
  if (decades.length > 0 && decades.length < ALL_DECADES.length) {
    const sorted = [...decades].sort((a, b) => a - b)
    const contiguous = sorted.every((d, i) => i === 0 || d - sorted[i - 1] === 10)
    return contiguous
      ? q.gte('year', sorted[0]).lte('year', sorted[sorted.length - 1] + 9)
      : q.or(sorted.map(d => `and(year.gte.${d},year.lte.${d + 9})`).join(','))
  }
  return q.gte('year', 1950)
}

// Random uuid-cursor sample of up to n rows matching the given base factory.
async function sample(base: () => Query, n: number): Promise<Record<string, unknown>[]> {
  const cursor = randomUUID()
  const first = await base().gte('id', cursor).order('id').limit(n)
  let rows = (first.data as Record<string, unknown>[] | null) ?? []
  if (!first.error && rows.length < n) {
    const wrap = await base().lt('id', cursor).order('id').limit(n - rows.length)
    if (!wrap.error && wrap.data) rows = [...rows, ...(wrap.data as Record<string, unknown>[])]
  }
  return first.error ? [] : rows
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    const areas: string[] = Array.isArray(body.areas) ? body.areas : []
    const rawDecades: (string | number)[] = Array.isArray(body.decades) ? body.decades : []
    const includeNow = rawDecades.includes('now')
    const decades: number[] = rawDecades.map(Number).filter((d: number) => ALL_DECADES.includes(d))
    const country: string | null = typeof body.country === 'string' && body.country ? body.country : null
    const artistMbId: string | null = typeof body.artistMbId === 'string' && body.artistMbId ? body.artistMbId : null
    const artistName: string | null = typeof body.artistName === 'string' && body.artistName ? body.artistName : null
    const exclude: string[] = Array.isArray(body.exclude) ? body.exclude : []
    const excludeSet = new Set(exclude)

    // Recent context (last ~6 played) → cross-batch continuity + anti-repeat
    const recentArr: Record<string, unknown>[] = Array.isArray(body.recent) ? body.recent : []
    const last = recentArr[recentArr.length - 1]
    const recentCtx: RecentContext = {
      prev: last ? {
        country: String(last.country || ''),
        area: String(last.macroArea || ''),
        family: familyOf(last.tags as string[] | undefined),
        year: Number(last.year) || 0,
        tags: (last.tags as string[]) || [],
      } : undefined,
      countries: recentArr.map(r => String(r.country || '')).filter(Boolean),
      artists: recentArr.map(r => String(r.artist || '')).filter(Boolean),
    }

    const sb = createServiceClient()

    const finish = (cands: Candidate[], shares: Record<string, number>, ctx: RecentContext) => {
      const ordered = buildSequence(cands, BATCH_SIZE, shares, ctx)
      const tracks: Track[] = ordered.map(c => dbRowToTrack(c.row))
      return NextResponse.json({ tracks })
    }

    // ── Country / artist filter: curated random within that subset (no region balance,
    //    no anti-country for a single country) ───────────────────────────────────────
    if (country || artistMbId || artistName) {
      // The DB stores country NAMES (e.g. "Ethiopia"), but callers may pass an ISO code
      // (e.g. daily.json uses "ET"). Match both so either form works.
      let countryValues: string[] = []
      if (country) {
        countryValues = [country]
        if (country.length === 2) {
          try {
            const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(country.toUpperCase())
            if (name && name.toUpperCase() !== country.toUpperCase()) countryValues.push(name)
          } catch { /* ignore */ }
        }
      }
      const base = (): Query => {
        let q = applyDecade(sb.from('tracks').select(TRACK_COLUMNS).or(PLAYABLE), decades, includeNow)
        if (country) q = q.in('country', countryValues)
        if (artistMbId) q = q.eq('artist_mb_id', artistMbId)
        else if (artistName) q = q.eq('artist_name', artistName)
        return q
      }
      const rows = await sample(base, POOL_SIZE)
      if (!rows.length) return NextResponse.json({ tracks: [] })
      let cands = rows.filter(r => !excludeSet.has(String(r.id))).map(toCandidate)
      if (!cands.length) cands = rows.map(toCandidate)
      const ctx: RecentContext = country ? { prev: recentCtx.prev, countries: [], artists: recentCtx.artists } : recentCtx
      return finish(cands, {}, ctx)
    }

    // ── Region-balanced "world journey" ────────────────────────────────────────────
    const valid = (a: string) => (MACRO_AREAS as readonly string[]).includes(a)
    const targetAreas = (areas.length && !areas.includes('All'))
      ? areas.filter(valid)
      : [...MACRO_AREAS]
    if (targetAreas.length === 0) targetAreas.push(...MACRO_AREAS)

    const shares = regionShares(REGION_PLAYABLE, targetAreas)

    const perArea = await Promise.all(targetAreas.map(a => {
      const k = Math.max(4, Math.min(40, Math.round(BATCH_SIZE * shares[a] * 2.4) + 3))
      const base = (): Query => applyDecade(
        sb.from('tracks').select(TRACK_COLUMNS).or(PLAYABLE).eq('macro_area', a), decades, includeNow,
      )
      return sample(base, k)
    }))

    const rows = perArea.flat()
    let cands = rows.filter(r => !excludeSet.has(String(r.id))).map(toCandidate)
    if (!cands.length) cands = rows.map(toCandidate)
    if (!cands.length) return NextResponse.json({ tracks: [] })

    return finish(cands, shares, recentCtx)

  } catch (e) {
    console.error('discover error', e)
    return NextResponse.json({ tracks: [] }, { status: 500 })
  }
}

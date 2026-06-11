import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { Track, FlowMode } from '@/lib/types'
import { dbRowToTrack, TRACK_COLUMNS } from '@/lib/tracks'

const BATCH_SIZE = 30
const ALL_DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]

// Adjacent macro-areas for Rotta mode — biased toward nearby regions
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const areas: string[]   = Array.isArray(body.areas) ? body.areas : []
    const decades: number[] = Array.isArray(body.decades)
      ? body.decades.map(Number).filter((d: number) => ALL_DECADES.includes(d))
      : []
    const country: string | null    = typeof body.country === 'string' && body.country ? body.country : null
    const artistMbId: string | null = typeof body.artistMbId === 'string' && body.artistMbId ? body.artistMbId : null
    const artistName: string | null = typeof body.artistName === 'string' && body.artistName ? body.artistName : null
    const exclude: string[] = Array.isArray(body.exclude) ? body.exclude.slice(-400) : []
    const mode: FlowMode    = body.mode === 'vortice' ? 'vortice' : 'rotta'
    const currentArea: string | null = body.currentArea || null

    const sb = createServiceClient()

    // Build area filter (skipped when narrowing to a country or an artist)
    let targetAreas: string[] = []
    if (!country && !artistMbId && !artistName) {
      if (areas.length === 0 || areas.includes('All')) {
        if (mode === 'rotta' && currentArea) {
          // Rotta: prefer current area, allow adjacent
          targetAreas = [currentArea, ...(ADJACENT[currentArea] || [])]
        }
      } else {
        targetAreas = areas
      }
    }

    let query = sb.from('tracks')
      .select(TRACK_COLUMNS)
      .or('youtube_video_id.not.is.null,itunes_preview_url.not.is.null')

    // Decade filter: contiguous range when possible, or-groups otherwise
    if (decades.length > 0 && decades.length < ALL_DECADES.length) {
      const sorted = [...decades].sort((a, b) => a - b)
      const contiguous = sorted.every((d, i) => i === 0 || d - sorted[i - 1] === 10)
      if (contiguous) {
        query = query.gte('year', sorted[0]).lte('year', sorted[sorted.length - 1] + 9)
      } else {
        query = query.or(sorted.map(d => `and(year.gte.${d},year.lte.${d + 9})`).join(','))
      }
    } else {
      query = query.gte('year', 1950)
    }

    if (country)    query = query.eq('country', country)
    if (artistMbId) query = query.eq('artist_mb_id', artistMbId)
    else if (artistName) query = query.eq('artist_name', artistName)

    if (targetAreas.length > 0) {
      query = query.in('macro_area', targetAreas)
    }

    if (exclude.length > 0) {
      query = query.not('id', 'in', `(${exclude.map(id => `"${id}"`).join(',')})`)
    }

    // Fetch a larger pool and apply weighted sampling in JS
    const { data, error } = await query.limit(200)

    if (error || !data?.length) {
      return NextResponse.json({ tracks: [] })
    }

    // Weighted sampling without replacement
    const pool = data as Record<string, unknown>[]
    const picked: Record<string, unknown>[] = []
    const remaining = [...pool]

    while (picked.length < BATCH_SIZE && remaining.length > 0) {
      const totalWeight = remaining.reduce((sum, r) => sum + (Number(r.weight) || 1), 0)
      let rnd = Math.random() * totalWeight
      let idx = 0
      for (let i = 0; i < remaining.length; i++) {
        rnd -= Number(remaining[i].weight) || 1
        if (rnd <= 0) { idx = i; break }
      }
      picked.push(remaining[idx])
      remaining.splice(idx, 1)
    }

    const tracks: Track[] = picked.map(dbRowToTrack)
    return NextResponse.json({ tracks })

  } catch (e) {
    console.error('discover error', e)
    return NextResponse.json({ tracks: [] }, { status: 500 })
  }
}

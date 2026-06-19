import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/db/supabase'
import { dbRowToTrack, TRACK_COLUMNS } from '@/lib/db/tracks'

// Single track by id — used by share links (/flow?track=<id>)
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ track: null }, { status: 400 })

  try {
    const sb = createServiceClient()
    const { data, error } = await sb.from('tracks')
      .select(TRACK_COLUMNS)
      .eq('id', id)
      .maybeSingle()

    if (error || !data) return NextResponse.json({ track: null }, { status: 404 })
    return NextResponse.json({ track: dbRowToTrack(data) })
  } catch (e) {
    console.error('track error', e)
    return NextResponse.json({ track: null }, { status: 500 })
  }
}

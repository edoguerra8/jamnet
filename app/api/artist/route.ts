import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Artist card data — bio_short (2 lines of cultural context, sez. 4.3)
export async function GET(req: NextRequest) {
  const mbId = req.nextUrl.searchParams.get('mbId')
  const name = req.nextUrl.searchParams.get('name')
  if (!mbId && !name) return NextResponse.json({ artist: null }, { status: 400 })

  try {
    const sb = createServiceClient()
    let query = sb.from('artists').select('mb_artist_id, name, country, macro_area, bio_short')
    query = mbId ? query.eq('mb_artist_id', mbId) : query.eq('name', name)
    const { data, error } = await query.maybeSingle()

    if (error || !data) return NextResponse.json({ artist: null }, { status: 404 })
    return NextResponse.json({
      artist: {
        mbId:      data.mb_artist_id,
        name:      data.name,
        country:   data.country,
        macroArea: data.macro_area,
        bioShort:  data.bio_short,
      },
    })
  } catch (e) {
    console.error('artist error', e)
    return NextResponse.json({ artist: null }, { status: 500 })
  }
}

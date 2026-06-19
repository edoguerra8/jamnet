import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/db/supabase'

export async function POST(req: NextRequest) {
  try {
    const { track_id, motivo, note } = await req.json()

    if (!track_id || !motivo) {
      return NextResponse.json({ error: 'track_id and motivo required' }, { status: 400 })
    }

    if (!['wrong_video', 'wrong_metadata'].includes(motivo)) {
      return NextResponse.json({ error: 'invalid motivo' }, { status: 400 })
    }

    const sb = createServiceClient()
    const { error } = await sb.from('match_reports').insert({
      track_id,
      motivo,
      note: note || null,
    })

    if (error) {
      console.error('report insert error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('report error', e)
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}

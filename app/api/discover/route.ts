import { NextRequest, NextResponse } from 'next/server'
import { discoverTracks } from '@/lib/discovery'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const tracks = await discoverTracks(q)
  return NextResponse.json({ tracks })
}

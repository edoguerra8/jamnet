import { NextRequest, NextResponse } from 'next/server'
import { discoverTracks } from '@/lib/discovery'

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const areasParam = p.get('areas') ?? ''
  const areas = areasParam
    ? areasParam.split(',').map(a => a.trim()).filter(Boolean)
    : ['All']
  const yearFrom = Math.max(1950, Math.min(2026, Number(p.get('yearFrom') ?? 1950)))
  const yearTo = Math.max(1950, Math.min(2026, Number(p.get('yearTo') ?? 2026)))
  const excludeParam = p.get('exclude') ?? ''
  const exclude = excludeParam ? excludeParam.split(',').filter(Boolean) : []

  const tracks = await discoverTracks(areas, yearFrom, yearTo, exclude)
  return NextResponse.json({ tracks })
}

import { NextRequest, NextResponse } from 'next/server'
import { executeStrategies } from '@/lib/discovery'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const strategies: string[] = Array.isArray(body.strategies) ? body.strategies : []
    const yearFrom = Math.max(1950, Math.min(2026, Number(body.yearFrom ?? 1950)))
    const yearTo   = Math.max(1950, Math.min(2026, Number(body.yearTo   ?? 2026)))
    const exclude: string[] = Array.isArray(body.exclude) ? body.exclude : []

    if (strategies.length === 0) return NextResponse.json({ tracks: [] })

    const tracks = await executeStrategies(strategies, yearFrom, yearTo, exclude)
    return NextResponse.json({ tracks })
  } catch {
    return NextResponse.json({ tracks: [] }, { status: 400 })
  }
}

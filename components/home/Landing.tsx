'use client'
import { useState } from 'react'
import { useMusicKit } from '@/lib/player/useMusicKit'
import { loadMusicKit } from '@/lib/player/musickit'
import GramophoneMark from './GramophoneMark'

const TOKEN = process.env.NEXT_PUBLIC_APPLE_MUSIC_DEVELOPER_TOKEN

interface Props {
  onConnected: () => void
}

// Landing (sez. 4.1b): pictogram + tagline + single "Connect Apple Music" action.
// Authorizing MusicKit here means playback later starts without a second prompt.
export default function Landing({ onConnected }: Props) {
  const mk = useMusicKit()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const connect = async () => {
    setBusy(true)
    setError(false)
    try {
      // Ensure MusicKit is fully configured before authorizing (the tap is the gesture).
      const inst = mk.instance() ?? (TOKEN ? await loadMusicKit(TOKEN) : null)
      if (!inst) throw new Error('MusicKit unavailable')
      await inst.authorize()
      onConnected()
    } catch (e) {
      console.error('[MusicKit] authorize failed:', e)
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-8 pt-safe pb-safe text-center">
      <div className="w-full max-w-sm flex flex-col items-center gap-10">
        <GramophoneMark className="w-56 h-auto" />

        <div className="flex flex-col gap-3">
          <h1 className="font-serif text-3xl leading-tight">JamNet</h1>
          <p className="font-sans text-muted text-[15px] leading-relaxed">
            The world&apos;s music, one song at a time.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 w-full">
          <button
            onClick={connect}
            disabled={busy}
            className="px-7 py-3 rounded-full bg-terracotta text-ivory text-[15px] font-sans hover:opacity-90 active:scale-95 transition-all duration-200 disabled:opacity-60"
          >
            {busy ? 'Connecting…' : 'Connect Apple Music'}
          </button>
          {error && (
            <p className="text-[12px] font-sans text-muted">
              Couldn&apos;t connect. Tap to try again.
            </p>
          )}
        </div>
      </div>
    </main>
  )
}

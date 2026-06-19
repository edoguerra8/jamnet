'use client'
import { useState } from 'react'
import { useMusicKit } from '@/lib/player/useMusicKit'
import { loadMusicKit } from '@/lib/player/musickit'
import CompassIcon from '@/components/ui/CompassIcon'

const TOKEN = process.env.NEXT_PUBLIC_APPLE_MUSIC_DEVELOPER_TOKEN

interface Props {
  onConnected: () => void
}

// Landing (sistema "Sabbia / Pino"): bussola-marchio + claim + unica azione
// "Connect Apple Music". Autorizzare MusicKit qui significa che la riproduzione
// successiva parte senza un secondo prompt.
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
    <main className="min-h-dvh flex flex-col bg-sand text-ink px-[34px] pt-safe pb-safe">
      <div className="pt-14 text-center text-[11px] font-sans uppercase tracking-[3.5px] text-muted">
        JamNet
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-[46px]">
        <CompassIcon size={150} className="text-ink" />
        <h1 className="font-serif font-normal text-[34px] leading-[1.2] -tracking-[0.2px] text-center max-w-[300px]">
          Music around the world, one song at a time<span className="text-pine">.</span>
        </h1>
      </div>

      <div className="flex flex-col items-center gap-[15px] pb-6">
        <button
          onClick={connect}
          disabled={busy}
          className="w-full rounded-[14px] bg-pine py-[17px] text-[15px] font-sans font-medium text-sand shadow-[0_2px_12px_rgba(63,107,78,0.22)] active:scale-[0.98] transition-transform duration-200 disabled:opacity-60"
        >
          {busy ? 'Connecting…' : 'Connect Apple Music'}
        </button>
        <p className="text-[11.5px] font-sans text-muted text-center">
          {error ? "Couldn't connect. Tap to try again." : 'Previews are free · full songs with Apple Music'}
        </p>
      </div>
    </main>
  )
}

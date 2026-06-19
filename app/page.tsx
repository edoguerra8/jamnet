'use client'
import { useEffect, useState } from 'react'
import HomeScreen from '@/components/home/HomeScreen'
import Landing from '@/components/home/Landing'
import BrowserGate from '@/components/home/BrowserGate'
import CompassIcon from '@/components/ui/CompassIcon'
import { isAppleMusicCapable } from '@/lib/player/musickit'

const CONNECTED_KEY = 'jamnet_connected'

type Phase = 'loading' | 'gate' | 'landing' | 'home'

// Entry orchestrator: non-Safari → gate; first visit → landing (Connect Apple Music);
// once connected → home. Decided client-side (needs navigator), so we render a neutral
// splash until mounted to avoid a hydration mismatch.
export default function Page() {
  const [phase, setPhase] = useState<Phase>('loading')

  useEffect(() => {
    // Dev-only: ?preview=home|landing|gate per ispezionare le schermate nel preview
    // (Chromium non passa isAppleMusicCapable, che manderebbe tutto sul gate).
    if (process.env.NODE_ENV === 'development') {
      const pv = new URLSearchParams(window.location.search).get('preview')
      if (pv === 'home' || pv === 'landing' || pv === 'gate') { setPhase(pv); return }
    }
    if (!isAppleMusicCapable()) { setPhase('gate'); return }
    const connected = localStorage.getItem(CONNECTED_KEY) === '1'
    setPhase(connected ? 'home' : 'landing')
  }, [])

  if (phase === 'loading') {
    return (
      <div className="h-dvh flex items-center justify-center bg-sand">
        <CompassIcon spinning size={40} className="text-ink/40" />
      </div>
    )
  }
  if (phase === 'gate') return <BrowserGate />
  if (phase === 'landing') {
    return (
      <Landing
        onConnected={() => {
          try { localStorage.setItem(CONNECTED_KEY, '1') } catch {}
          setPhase('home')
        }}
      />
    )
  }
  return <HomeScreen />
}

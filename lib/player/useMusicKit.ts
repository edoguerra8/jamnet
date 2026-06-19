'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadMusicKit, MKInstance, PLAYBACK } from './musickit'

const TOKEN = process.env.NEXT_PUBLIC_APPLE_MUSIC_DEVELOPER_TOKEN

export interface MusicKitController {
  /** MusicKit loaded & configured (Safari only) */
  ready: boolean
  /** reflects playbackState === playing */
  isPlaying: boolean
  /** authorize if needed, queue the song and play. Call from a user gesture the first time. */
  playSong: (appleMusId: string) => Promise<void>
  pause: () => void
  resume: () => Promise<void>
  stop: () => void
  /** current playback position / track length, in seconds */
  position: number
  duration: number
  /** seek the current track to `seconds` */
  seekTo: (seconds: number) => void
  /** the underlying instance (for the Library API), or null if not ready */
  instance: () => MKInstance | null
  isAuthorized: () => boolean
}

// Thin React wrapper over the MusicKit singleton. `onEnded` fires when a song completes.
export function useMusicKit(onEnded?: () => void): MusicKitController {
  const mkRef = useRef<MKInstance | null>(null)
  const [ready, setReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const onEndedRef = useRef(onEnded)
  useEffect(() => { onEndedRef.current = onEnded }, [onEnded])

  useEffect(() => {
    if (!TOKEN) return
    let mk: MKInstance | null = null
    const onChange = () => {
      if (!mk) return
      const s = mk.playbackState
      setIsPlaying(s === PLAYBACK.playing)
      if (s === PLAYBACK.completed || s === PLAYBACK.ended) onEndedRef.current?.()
    }
    const onTime = () => {
      if (!mk) return
      setPosition(mk.currentPlaybackTime || 0)
      setDuration(mk.currentPlaybackDuration || 0)
    }
    loadMusicKit(TOKEN)
      .then(instance => {
        mk = instance
        mkRef.current = instance
        instance.addEventListener('playbackStateDidChange', onChange)
        instance.addEventListener('playbackTimeDidChange', onTime)
        setReady(true)
      })
      .catch((e) => { console.error('[MusicKit] load/configure failed:', e) /* non-Safari → preview fallback */ })
    return () => {
      mk?.removeEventListener('playbackStateDidChange', onChange)
      mk?.removeEventListener('playbackTimeDidChange', onTime)
    }
  }, [])

  const seekTo = useCallback((seconds: number) => {
    mkRef.current?.seekToTime(Math.max(0, seconds))
  }, [])

  const playSong = useCallback(async (appleMusId: string) => {
    const mk = mkRef.current
    if (!mk) throw new Error('MusicKit not ready')
    if (!mk.isAuthorized) await mk.authorize()
    await mk.setQueue({ song: appleMusId })
    await mk.play()
  }, [])

  const pause = useCallback(() => { mkRef.current?.pause() }, [])
  const resume = useCallback(async () => { await mkRef.current?.play() }, [])
  const stop = useCallback(() => { mkRef.current?.stop() }, [])
  const instance = useCallback(() => mkRef.current, [])
  const isAuthorized = useCallback(() => mkRef.current?.isAuthorized ?? false, [])

  return { ready, isPlaying, playSong, pause, resume, stop, position, duration, seekTo, instance, isAuthorized }
}

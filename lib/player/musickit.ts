// MusicKit JS — types, constants and a one-time loader for Apple Music playback.
// Full playback works only on Safari (Mac/iPhone/iPad); elsewhere loadMusicKit rejects.

export const MK_CDN = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js'

// MusicKit.PlaybackStates numeric values.
export const PLAYBACK = {
  none: 0,
  loading: 1,
  playing: 2,
  paused: 3,
  stopped: 4,
  ended: 5,
  seeking: 6,
  waiting: 7,
  stalled: 8,
  completed: 10,
} as const

export interface MKInstance {
  isAuthorized: boolean
  playbackState: number
  currentPlaybackTime: number
  currentPlaybackDuration: number
  authorize(): Promise<string>
  setQueue(opts: { song: string }): Promise<void>
  play(): Promise<void>
  pause(): void
  stop(): void
  seekToTime(time: number): Promise<void>
  addEventListener(event: string, handler: () => void): void
  removeEventListener(event: string, handler: () => void): void
  // Library API — used by "Save to Apple Music"
  api?: {
    music?: (path: string, query?: Record<string, unknown>, opts?: { fetchOptions?: RequestInit }) => Promise<unknown>
  }
  musicUserToken?: string
}

export interface MusicKitGlobal {
  // v3 returns a Promise resolving to the configured instance; older builds return void.
  configure(config: object): Promise<MKInstance> | MKInstance | void
  getInstance(): MKInstance
  PlaybackStates: Record<string, number>
}

declare global {
  interface Window {
    MusicKit?: MusicKitGlobal
  }
}

// Returns true when the runtime can host Apple Music playback (Safari/WebKit).
export function isAppleMusicCapable(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua)
  const isAppleDevice = /Macintosh|iPhone|iPad|iPod/.test(ua)
  return isSafari && isAppleDevice
}

// Load the MusicKit script once and configure it. Resolves with the singleton instance.
let loadPromise: Promise<MKInstance> | null = null
export function loadMusicKit(developerToken: string): Promise<MKInstance> {
  if (loadPromise) return loadPromise
  loadPromise = new Promise<MKInstance>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('MusicKit: no window'))
      return
    }
    const configure = async () => {
      try {
        // v3: configure() is async — await it so the API client/token is ready before
        // any setQueue/play call. Fall back to getInstance() for older builds (void).
        const configured = await window.MusicKit!.configure({
          developerToken,
          app: { name: 'JamNet', build: '1.0.0' },
        })
        resolve((configured as MKInstance) || window.MusicKit!.getInstance())
      } catch (e) {
        reject(e)
      }
    }
    if (window.MusicKit) {
      configure()
      return
    }
    document.addEventListener('musickitloaded', configure, { once: true })
    if (!document.querySelector(`script[src="${MK_CDN}"]`)) {
      const s = document.createElement('script')
      s.src = MK_CDN
      s.async = true
      s.onerror = () => reject(new Error('MusicKit failed to load'))
      document.head.appendChild(s)
    }
  })
  return loadPromise
}

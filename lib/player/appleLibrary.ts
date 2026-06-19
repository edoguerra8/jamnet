import { MKInstance } from './musickit'

// Create a playlist in the user's Apple Music library from JamNet tracks (sez. 5.3).
// Only tracks with an apple_music_id can be added; returns how many of the total made it.
export async function saveToAppleMusic(
  instance: MKInstance | null,
  name: string,
  appleMusIds: string[],
  total: number,
  description?: string,
): Promise<{ saved: number; total: number }> {
  if (!instance) throw new Error('MusicKit not ready')
  if (!instance.api?.music) throw new Error('MusicKit Library API unavailable')
  if (!instance.isAuthorized) await instance.authorize()

  const data = appleMusIds.map(id => ({ id, type: 'songs' }))
  await instance.api.music('v1/me/library/playlists', {}, {
    fetchOptions: {
      method: 'POST',
      body: JSON.stringify({
        attributes: { name, ...(description ? { description } : {}) },
        relationships: { tracks: { data } },
      }),
    },
  })

  return { saved: appleMusIds.length, total }
}

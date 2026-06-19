#!/usr/bin/env node
/**
 * JamNet — new-releases.js
 * Aggiunge al catalogo le uscite recenti (ultimi 90 giorni) per tutte le macro-aree.
 * Imposta is_new_release = true sui brani aggiunti.
 * Eseguire settimanalmente: node scripts/new-releases.js
 *
 * Prerequisiti in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   APPLE_MUSIC_DEVELOPER_TOKEN
 */

const { readFileSync, writeFileSync, existsSync } = require('fs')
const { join } = require('path')

const ROOT       = join(__dirname, '..')
const CHECKPOINT = join(__dirname, '.checkpoint-newreleases.json')

function loadEnv() {
  const path = join(ROOT, '.env.local')
  if (!existsSync(path)) throw new Error('.env.local not found')
  const env = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim()
  }
  return env
}

const ENV         = loadEnv()
const SUPABASE_URL = ENV['NEXT_PUBLIC_SUPABASE_URL']
const SUPABASE_KEY = ENV['SUPABASE_SERVICE_ROLE_KEY']
const APPLE_TOKEN  = ENV['APPLE_MUSIC_DEVELOPER_TOKEN']

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

const REGIONS = JSON.parse(readFileSync(join(ROOT, 'data/regions.json'), 'utf8'))

const MB_DELAY_MS  = 1150
const APPLE_DELAY_MS = 400
const NEW_RELEASE_DAYS = 90   // finestra "nuova uscita"
const MAX_PER_AREA = 50       // brani nuovi max per area per run
const JUNK_RE = /karaoke|tribute|made famous|lullaby|meditation|relaxing|sleep music|cover version|originally performed|as made popular|instrumental version of|backing track/i

let lastMbCall = 0
let lastAppleCall = 0

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function loadCheckpoint() {
  try { return JSON.parse(readFileSync(CHECKPOINT, 'utf8')) }
  catch { return { lastRun: null, addedTotal: 0 } }
}

function saveCheckpoint(cp) {
  writeFileSync(CHECKPOINT, JSON.stringify(cp, null, 2))
}

async function mbFetch(path) {
  const wait = MB_DELAY_MS - (Date.now() - lastMbCall)
  if (wait > 0) await sleep(wait)
  lastMbCall = Date.now()
  const res = await fetch(`https://musicbrainz.org/ws/2${path}`, {
    headers: {
      'User-Agent': 'JamNet/1.0 (edoardoguerra88@gmail.com)',
      Accept: 'application/json',
    },
  })
  if (!res.ok) return null
  return res.json()
}

async function appleSearch(isrc) {
  if (!APPLE_TOKEN || !isrc) return null
  const wait = APPLE_DELAY_MS - (Date.now() - lastAppleCall)
  if (wait > 0) await sleep(wait)
  lastAppleCall = Date.now()
  try {
    const res = await fetch(
      `https://api.music.apple.com/v1/catalog/it/songs?filter[isrc]=${encodeURIComponent(isrc)}&limit=1`,
      { headers: { Authorization: `Bearer ${APPLE_TOKEN}` } }
    )
    if (!res.ok) return null
    const json = await res.json()
    return json?.data?.[0]?.id || null
  } catch { return null }
}

async function itunesSearch(artist, title) {
  try {
    const q = encodeURIComponent(`${artist} ${title}`)
    const res = await fetch(`https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=5`)
    if (!res.ok) return null
    const data = await res.json()
    const results = (data.results || []).filter(r =>
      r.previewUrl && !JUNK_RE.test(r.trackName || '')
    )
    if (!results.length) return null
    const pick = results.find(r =>
      r.artistName?.toLowerCase().includes(artist.toLowerCase())
    ) || results[0]
    return {
      itunes_track_id:    String(pick.trackId),
      itunes_preview_url: pick.previewUrl,
      artwork_url:        (pick.artworkUrl100 || '').replace(/\/\d+x\d+bb/, '/600x600bb') || null,
      isrc:               pick.isrc || null,
    }
  } catch { return null }
}

// Fetch recent MusicBrainz releases for a country ISO code
async function fetchRecentReleases(iso, sinceDate) {
  const date = sinceDate.toISOString().slice(0, 10)
  const data = await mbFetch(
    `/release?country=${iso}&date=${date}..&limit=25&fmt=json&inc=recordings+tags+artist-credits`
  )
  return data?.releases || []
}

async function upsertTrack(row) {
  const { error } = await sb.from('tracks').upsert(row, { onConflict: 'mb_recording_id' })
  if (error) console.warn('  upsertTrack:', error.message)
}

// Reset is_new_release = false on old entries (older than NEW_RELEASE_DAYS)
async function expireOldReleases() {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - NEW_RELEASE_DAYS)
  const { error } = await sb.from('tracks')
    .update({ is_new_release: false })
    .eq('is_new_release', true)
    .lt('created_at', cutoff.toISOString())
  if (error) console.warn('  expireOldReleases:', error.message)
  else console.log(`  Scaduti i "New release" antecedenti al ${cutoff.toISOString().slice(0, 10)}`)
}

async function main() {
  const cp = loadCheckpoint()
  const since = new Date()
  since.setDate(since.getDate() - NEW_RELEASE_DAYS)

  console.log(`JamNet — Nuove uscite (ultimi ${NEW_RELEASE_DAYS} giorni, da ${since.toISOString().slice(0, 10)})\n`)

  await expireOldReleases()

  const areaEntries = Object.entries(REGIONS)
    .filter(([k, v]) => k !== '_comment' && v && Array.isArray(v.countries))

  let addedTotal = 0

  for (const [area, { countries }] of areaEntries) {
    console.log(`\n── ${area}`)
    let addedArea = 0

    for (const iso of countries) {
      if (addedArea >= MAX_PER_AREA) break

      const releases = await fetchRecentReleases(iso, since)
      if (!releases.length) continue

      for (const release of releases) {
        if (addedArea >= MAX_PER_AREA) break
        const recs = release.recordings || []

        for (const rec of recs) {
          if (!rec.id || !rec.title) continue
          if (JUNK_RE.test(rec.title)) continue

          const artistCredit = release['artist-credit']?.[0]
          const artistName = artistCredit?.artist?.name || artistCredit?.name || 'Unknown'
          const tags = (rec.tags || []).map(t => t.name).slice(0, 8)
          const year = parseInt((release.date || '').slice(0, 4)) || null

          const itunesData = await itunesSearch(artistName, rec.title)
          const isrc = itunesData?.isrc || (rec.isrcs?.[0] || null)
          const appleId = isrc ? await appleSearch(isrc) : null

          await upsertTrack({
            mb_recording_id:    rec.id,
            title:              rec.title,
            artist_name:        artistName,
            artist_mb_id:       artistCredit?.artist?.id || null,
            country:            iso,
            macro_area:         area,
            year,
            apple_music_id:     appleId,
            itunes_track_id:    itunesData?.itunes_track_id || null,
            itunes_preview_url: itunesData?.itunes_preview_url || null,
            artwork_url:        itunesData?.artwork_url || null,
            isrc,
            tags,
            weight:             1,
            is_new_release:     true,
          })
          addedArea++
          addedTotal++
        }
      }
    }
    if (addedArea) console.log(`  +${addedArea} brani`)
  }

  cp.lastRun = new Date().toISOString()
  cp.addedTotal = (cp.addedTotal || 0) + addedTotal
  saveCheckpoint(cp)

  console.log(`\nFatto. +${addedTotal} brani nuovi aggiunti al catalogo.`)
}

main().catch(e => { console.error(e); process.exit(1) })

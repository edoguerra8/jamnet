#!/usr/bin/env node
/**
 * JamNet — build-catalog.js
 * Popola il catalogo Supabase da MusicBrainz + YouTube + iTunes.
 *
 * Lanciare con:  node scripts/build-catalog.js
 * Rilanciabile:  riprende dal checkpoint scripts/.checkpoint.json
 *
 * Prerequisiti in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, YOUTUBE_API_KEY
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync, writeFileSync, existsSync } = require('fs')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createClient } = require('@supabase/supabase-js')

const ROOT       = join(__dirname, '..')
const CHECKPOINT = join(__dirname, '.checkpoint.json')

// ── Env ────────────────────────────────────────────────────────────────────

function loadEnv() {
  const path = join(ROOT, '.env.local')
  if (!existsSync(path)) throw new Error('.env.local not found at ' + path)
  const env = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim()
  }
  return env
}

const ENV          = loadEnv()
const SUPABASE_URL = ENV['NEXT_PUBLIC_SUPABASE_URL']
const SUPABASE_KEY = ENV['SUPABASE_SERVICE_ROLE_KEY']
const YOUTUBE_KEY  = ENV['YOUTUBE_API_KEY']

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Config ─────────────────────────────────────────────────────────────────

const REGIONS            = JSON.parse(readFileSync(join(ROOT, 'data/regions.json'), 'utf8'))
const MB_DELAY_MS        = 1150   // slightly over 1 s between MusicBrainz requests
const YT_QUOTA_PER_RUN   = 90    // conservative daily budget
const ARTISTS_PER_COUNTRY = 100  // max artists per country per run
const RECS_PER_ARTIST    = 20

const JUNK_RE = /karaoke|tribute|made famous|lullaby|meditation|relaxing|sleep music|cover version|originally performed|as made popular|instrumental version of|backing track/i
// MusicBrainz usa [unknown], [silence], ecc. per dati mancanti — li scartiamo
const MB_UNKNOWN_RE = /^\[/

// ── Checkpoint ─────────────────────────────────────────────────────────────

function loadCheckpoint() {
  try { return JSON.parse(readFileSync(CHECKPOINT, 'utf8')) }
  catch { return { ytSearchesDone: 0, completedAreas: [], artistsDone: {}, lastRun: null } }
}

function saveCheckpoint(cp) {
  writeFileSync(CHECKPOINT, JSON.stringify(cp, null, 2))
}

// ── Rate-limited MusicBrainz fetch ─────────────────────────────────────────

let lastMbCall = 0

async function mbFetch(path) {
  const wait = MB_DELAY_MS - (Date.now() - lastMbCall)
  if (wait > 0) await sleep(wait)
  lastMbCall = Date.now()
  const url = `https://musicbrainz.org/ws/2${path}`
  const res = await withRetry('mbFetch', () => fetch(url, {
    headers: {
      'User-Agent': 'JamNet/1.0 (edoardoguerra88@gmail.com)',
      Accept: 'application/json',
    },
  }))
  if (res.status === 503) {
    console.warn('  MusicBrainz 503 — retry in 15 s')
    await sleep(15000)
    return mbFetch(path)
  }
  if (!res.ok) return null
  return res.json()
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Retry helper ────────────────────────────────────────────────────────────
// 3 retries with exponential backoff (15 s → 60 s → 180 s).
// If all attempts fail, throws so the caller can skip the item.

const RETRY_DELAYS = [15_000, 60_000, 180_000]

async function withRetry(label, fn) {
  let lastErr
  for (let i = 0; i <= RETRY_DELAYS.length; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[i]
        console.warn(`\n  [retry] ${label} failed (${err.code || err.message}) — attempt ${i + 1}/${RETRY_DELAYS.length}, waiting ${delay / 1000}s`)
        await sleep(delay)
      }
    }
  }
  throw lastErr
}

// ── Wikipedia bio_short ────────────────────────────────────────────────────

async function fetchWikiBio(wikiTitle) {
  if (!wikiTitle) return null
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`
    const res = await withRetry('fetchWikiBio', () => fetch(url, { headers: { 'User-Agent': 'JamNet/1.0' } }))
    if (!res.ok) return null
    const data = await res.json()
    const extract = data.extract || ''
    const sentences = extract.match(/[^.!?]+[.!?]/g) || []
    return sentences.slice(0, 2).join(' ').slice(0, 220).trim() || null
  } catch { return null }
}

// ── MusicBrainz helpers ────────────────────────────────────────────────────

async function fetchArtistsForCountry(countryName, offset) {
  const q = encodeURIComponent(`area:"${countryName}"`)
  const data = await mbFetch(`/artist?query=${q}&limit=100&offset=${offset}&fmt=json`)
  return data?.artists || []
}

async function fetchArtistDetails(mbId) {
  return mbFetch(`/artist/${mbId}?fmt=json&inc=url-rels+tags`)
}

async function fetchRecordingsForArtist(mbId) {
  const data = await mbFetch(`/recording?artist=${mbId}&limit=${RECS_PER_ARTIST}&fmt=json&inc=tags`)
  return data?.recordings || []
}

function extractWikiTitle(urlRels) {
  if (!Array.isArray(urlRels)) return null
  for (const rel of urlRels) {
    const u = rel.url?.resource || ''
    if (u.includes('en.wikipedia.org/wiki/')) {
      return decodeURIComponent(u.split('/wiki/')[1])
    }
  }
  return null
}

function calcRelevance(artist) {
  return Math.max(1, parseInt(artist.score) || 0, parseInt(artist['recording-count']) || 0)
}

function getFirstYear(recording) {
  const fd = recording['first-release-date']
  if (fd) return parseInt(fd.slice(0, 4))
  const dates = (recording.releases || [])
    .map(r => parseInt((r.date || '9999').slice(0, 4)))
    .filter(y => y > 1000 && y < 2100)
  return dates.length ? Math.min(...dates) : null
}

function getTags(recording) {
  return (recording.tags || []).map(t => t.name).slice(0, 8)
}

// ── YouTube search ──────────────────────────────────────────────────────────

async function youtubeSearch(query, cp) {
  if (!YOUTUBE_KEY || cp.ytSearchesDone >= YT_QUOTA_PER_RUN) return null
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=id&type=video&videoEmbeddable=true&q=${encodeURIComponent(query)}&key=${YOUTUBE_KEY}&maxResults=1`
    const res = await withRetry('youtubeSearch', () => fetch(url))
    cp.ytSearchesDone++
    if (!res.ok) return null
    const data = await res.json()
    return data.items?.[0]?.id?.videoId || null
  } catch { return null }
}

// ── iTunes search ───────────────────────────────────────────────────────────

async function itunesSearch(artist, title) {
  try {
    const q = encodeURIComponent(`${artist} ${title}`)
    const res = await withRetry('itunesSearch', () => fetch(`https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=10`))
    if (!res.ok) return null
    const data = await res.json()
    const results = (data.results || []).filter(r =>
      r.previewUrl &&
      !JUNK_RE.test(r.trackName || '') &&
      !JUNK_RE.test(r.collectionName || '')
    )
    if (!results.length) return null
    const exact = results.find(r =>
      r.artistName?.toLowerCase().includes(artist.toLowerCase()) ||
      artist.toLowerCase().includes(r.artistName?.toLowerCase())
    )
    const pick = exact || results[0]
    return {
      itunes_track_id:   String(pick.trackId),
      itunes_preview_url: pick.previewUrl,
      artwork_url:       (pick.artworkUrl100 || '').replace(/\/\d+x\d+bb/, '/600x600bb') || null,
      isrc:              pick.isrc || null,
    }
  } catch { return null }
}

// ── Supabase upserts ────────────────────────────────────────────────────────

async function upsertArtist(row) {
  await withRetry('upsertArtist', async () => {
    const { error } = await sb.from('artists').upsert(row, { onConflict: 'mb_artist_id' })
    if (error) console.warn('  upsertArtist:', error.message)
  })
}

async function upsertTrack(row) {
  await withRetry('upsertTrack', async () => {
    const { error } = await sb.from('tracks').upsert(row, { onConflict: 'mb_recording_id' })
    if (error) console.warn('  upsertTrack:', error.message)
  })
}

// ── Resolve unmatched tracks ────────────────────────────────────────────────

async function resolveUnmatched(cp) {
  if (cp.ytSearchesDone >= YT_QUOTA_PER_RUN) return
  console.log('\n── Resolving unmatched tracks ─────────────────────────────────')
  const { data: pending } = await sb.from('tracks')
    .select('id, title, artist_name, itunes_preview_url')
    .is('youtube_video_id', null)
    .limit(200)
  if (!pending?.length) { console.log('  Nothing to resolve.'); return }
  console.log(`  ${pending.length} tracks without YouTube — attempting matches`)
  for (const t of pending) {
    if (cp.ytSearchesDone >= YT_QUOTA_PER_RUN) {
      console.log(`  Quota exhausted (${cp.ytSearchesDone} searches used today)`)
      break
    }
    try {
      const ytId = await youtubeSearch(`${t.artist_name} ${t.title} official`, cp)
      if (ytId) {
        await withRetry('resolveUnmatched:update', () =>
          sb.from('tracks').update({ youtube_video_id: ytId }).eq('id', t.id)
        )
      } else if (!t.itunes_preview_url) {
        const itunes = await itunesSearch(t.artist_name, t.title)
        if (itunes) {
          await withRetry('resolveUnmatched:itunesUpdate', () =>
            sb.from('tracks').update(itunes).eq('id', t.id)
          )
        }
      }
    } catch (err) {
      console.error(`  Skipping unmatched track "${t.title}": ${err.message}`)
    }
    saveCheckpoint(cp)
    await sleep(200)
  }
}

// ── Log summary ─────────────────────────────────────────────────────────────

async function logSummary() {
  console.log('\n════════════════════════════════════════════════════════════')
  console.log('  CATALOG SUMMARY')
  console.log('════════════════════════════════════════════════════════════')
  const areaNames = Object.keys(REGIONS).filter(k => REGIONS[k] && Array.isArray(REGIONS[k].musicbrainz_countries))
  for (const area of areaNames) {
    const { count: total }    = await sb.from('tracks').select('*', { count: 'exact', head: true }).eq('macro_area', area)
    const { count: playable } = await sb.from('tracks').select('*', { count: 'exact', head: true })
      .eq('macro_area', area).or('youtube_video_id.not.is.null,itunes_preview_url.not.is.null')
    console.log(`  ${area.padEnd(20)} ${String(playable || 0).padStart(4)} playable / ${String(total || 0).padStart(5)} total`)
  }
  console.log('\n  By decade:')
  for (let d = 1950; d <= 2020; d += 10) {
    const { count } = await sb.from('tracks').select('*', { count: 'exact', head: true })
      .gte('year', d).lt('year', d + 10).or('youtube_video_id.not.is.null,itunes_preview_url.not.is.null')
    console.log(`    ${d}s: ${count || 0} playable tracks`)
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('JamNet build-catalog — started at', new Date().toISOString())
  const cp = loadCheckpoint()
  console.log(`  Resumed from: ${cp.lastRun || 'fresh start'}`)
  console.log(`  YouTube searches used: ${cp.ytSearchesDone}/${YT_QUOTA_PER_RUN}`)

  const areaEntries = Object.entries(REGIONS).filter(([, v]) => v && Array.isArray(v.musicbrainz_countries))

  for (const [area, { musicbrainz_countries: mbCountries }] of areaEntries) {
    if (cp.completedAreas.includes(area)) {
      console.log(`\nSkipping ${area} (already completed)`)
      continue
    }

    console.log(`\n════ ${area} (${mbCountries.length} countries) ════`)

    for (const countryName of mbCountries) {
      console.log(`\n  ── ${countryName}`)
      const cpKey = `${area}::${countryName}`
      let pageOffset = cp.artistsDone[cpKey] || 0
      let processed  = 0

      while (processed < ARTISTS_PER_COUNTRY) {
        const artists = await fetchArtistsForCountry(countryName, pageOffset)
        if (!artists.length) break

        for (const artist of artists) {
          const mbId = artist.id
          if (!mbId) continue

          try {
            const details  = await fetchArtistDetails(mbId)
            const wikiTitle = extractWikiTitle(details?.relations)
            const bioShort  = wikiTitle ? await fetchWikiBio(wikiTitle) : null
            const relevance = calcRelevance(artist)

            await upsertArtist({
              mb_artist_id: mbId,
              name: artist.name,
              country: countryName,
              macro_area: area,
              bio_short: bioShort,
              relevance,
            })

            const recordings = await fetchRecordingsForArtist(mbId)
            let tracksAdded = 0
            for (const rec of recordings) {
              if (!rec.id || !rec.title) continue
              if (MB_UNKNOWN_RE.test(rec.title)) continue
              if (JUNK_RE.test(rec.title)) continue

              const year = getFirstYear(rec)
              const tags = getTags(rec)

              let ytId = null
              if (cp.ytSearchesDone < YT_QUOTA_PER_RUN) {
                ytId = await youtubeSearch(`${artist.name} ${rec.title}`, cp)
              }

              let itunesData = null
              if (!ytId) {
                itunesData = await itunesSearch(artist.name, rec.title)
              }

              try {
                await upsertTrack({
                  mb_recording_id:   rec.id,
                  title:             rec.title,
                  artist_name:       artist.name,
                  artist_mb_id:      mbId,
                  country:           countryName,
                  macro_area:        area,
                  year,
                  youtube_video_id:  ytId,
                  itunes_track_id:   itunesData?.itunes_track_id || null,
                  itunes_preview_url: itunesData?.itunes_preview_url || null,
                  artwork_url:       itunesData?.artwork_url || null,
                  isrc:              itunesData?.isrc || null,
                  tags,
                  weight: Math.max(1, Math.min(100, Math.ceil(relevance / 10))),
                })
                tracksAdded++
              } catch (err) {
                console.error(`\n  Skipping track "${rec.title}": ${err.message}`)
              }
            }
            process.stdout.write(`\r    artist ${processed + 1}: ${artist.name.slice(0, 30).padEnd(30)} | ${tracksAdded} tracks`)
          } catch (err) {
            console.error(`\n  Skipping artist ${artist.name || mbId}: ${err.message}`)
          } finally {
            processed++
            cp.artistsDone[cpKey] = pageOffset + processed
            saveCheckpoint(cp)
          }
          if (processed >= ARTISTS_PER_COUNTRY) break
        }

        pageOffset += artists.length
        if (artists.length < 100) break
      }
      console.log(`\n    ${processed} artists processed`)
    }

    cp.completedAreas.push(area)
    cp.lastRun = new Date().toISOString()
    saveCheckpoint(cp)
    console.log(`✓ ${area} done`)
  }

  await resolveUnmatched(cp)
  await logSummary()

  // Reset YouTube counter for next day's run
  cp.ytSearchesDone = 0
  saveCheckpoint(cp)
  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) })

#!/usr/bin/env node
/**
 * JamNet — build-catalog.js
 * Popola il catalogo Supabase da MusicBrainz + YouTube + iTunes.
 *
 * Lanciare con:  node scripts/build-catalog.js
 * Rilanciabile:  riprende dal checkpoint scripts/.checkpoint.json
 *
 * Prerequisiti in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, YOUTUBE_API_KEY,
 *   LASTFM_API_KEY, FOLKWAYS_API_KEY (chiave api.data.gov per la Smithsonian Open Access API)
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync, writeFileSync, existsSync } = require('fs')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path')
// @supabase/supabase-js è richiesto in modo lazy (solo quando si scrive su Supabase),
// così la dry-run Wikidata gira anche senza node_modules installati.

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

// ── CLI flags ────────────────────────────────────────────────────────────────
// --wikidata-test=IS,BO,LA  → dry run: interroga solo Wikidata e stampa un report,
//                             nessuna scrittura su Supabase (utile senza .env.local).
// --wikidata-only           → esegue solo lo stage Wikidata (salta MusicBrainz).
// --skip-wikidata           → esegue solo MusicBrainz (comportamento legacy).
// --lastfm-test[=Nome1,Nome2] → dry run: interroga Last.fm (e MusicBrainz per la base)
//                             per un campione di artisti e stampa relevance/weight
//                             prima/dopo. Nessuna scrittura. Funziona senza .env.local.
// --lastfm-only             → esegue solo lo stage Last.fm (salta MusicBrainz e Wikidata).
// --skip-lastfm             → salta lo stage Last.fm.
// --lastfm-discover         → abilita lo stage opzionale di SCOPERTA via Last.fm
//                             (geo.getTopArtists per paese, tag.getTopArtists per genere).
// --lastfm-tracks           → abilita lo stage opzionale di segnale PER-BRANO via
//                             Last.fm (track.getInfo), limitato alle tracce degli
//                             artisti ad alti ascolti → bonus quality_score per-brano.
//                             Off di default: la scoperta è una fase separatamente gated.
// --folkways-test=Mali,Indonesia → dry run: interroga la Smithsonian Open Access API
//                             (Folkways/archivi Rinzler) per i paesi indicati e mostra
//                             quanti esecutori si scoprono e quanti si risolvono su
//                             MusicBrainz. Nessuna scrittura. Richiede FOLKWAYS_API_KEY
//                             (in .env.local o come variabile d'ambiente).
// --folkways-only           → esegue solo lo stage Folkways (salta MB/Wikidata/Last.fm).
// --skip-folkways           → salta lo stage Folkways.
// --spotify-test[=Nome1,..] → dry run: autentica (Client Credentials), cerca gli artisti
//                             del campione e stampa gli artisti correlati trovati.
//                             Nessuna scrittura. Legge le credenziali da .env.local o env.
// --spotify-only            → esegue solo lo stage Spotify (salta MB/Wikidata/Last.fm).
// --skip-spotify            → salta lo stage Spotify.
// --spotify-seeds=N         → numero di artisti-seme (top per relevance) usati come
//                             punto di partenza per i correlati (default 200).
// --discogs-test=Paese:decennio[,...] → dry run: interroga Discogs per (paese, decennio)
//                             — es. "Mali:1970,Nigeria:1970" — e stampa quante release,
//                             quanti brani e quanti artisti (nuovi vs MB) emergono.
//                             Nessuna scrittura. Legge DISCOGS_TOKEN da .env.local o env.
// --discogs-only            → esegue solo lo stage Discogs (salta MB/Wikidata/Last.fm/Spotify).
// --skip-discogs            → salta lo stage Discogs.
// --artwork-only            → esegue solo il backfill artwork_url per le tracce con apple_music_id
//                             ma senza artwork (batch da 300 via Apple Music API).

const ARGV       = process.argv.slice(2)
const WD_TEST    = (ARGV.find(a => a.startsWith('--wikidata-test=')) || '').split('=')[1] || null
const WD_ONLY    = ARGV.includes('--wikidata-only')
const SKIP_WD    = ARGV.includes('--skip-wikidata')
const LF_TEST_ARG = ARGV.find(a => a === '--lastfm-test' || a.startsWith('--lastfm-test='))
const LF_TEST    = LF_TEST_ARG ? ((LF_TEST_ARG.split('=')[1] || '').trim() || true) : null
const LF_ONLY    = ARGV.includes('--lastfm-only')
const SKIP_LF    = ARGV.includes('--skip-lastfm')
const LF_DISCOVER = ARGV.includes('--lastfm-discover')
const LF_TRACKS  = ARGV.includes('--lastfm-tracks')
const SP_TEST_ARG = ARGV.find(a => a === '--spotify-test' || a.startsWith('--spotify-test='))
const SP_TEST    = SP_TEST_ARG ? ((SP_TEST_ARG.split('=')[1] || '').trim() || true) : null
const SP_ONLY    = ARGV.includes('--spotify-only')
const SKIP_SP    = ARGV.includes('--skip-spotify')
const SP_SEEDS   = parseInt((ARGV.find(a => a.startsWith('--spotify-seeds=')) || '').split('=')[1]) || 200
const DG_TEST    = (ARGV.find(a => a.startsWith('--discogs-test=')) || '').split('=')[1] || null
const DG_ONLY    = ARGV.includes('--discogs-only')
const SKIP_DG    = ARGV.includes('--skip-discogs')
const FW_TEST    = (ARGV.find(a => a.startsWith('--folkways-test=')) || '').split('=')[1] || null
const FW_ONLY    = ARGV.includes('--folkways-only')
const SKIP_FW    = ARGV.includes('--skip-folkways')
const AP_ONLY    = ARGV.includes('--apple-only')
const SKIP_AP    = ARGV.includes('--skip-apple')
const ART_ONLY   = ARGV.includes('--artwork-only')
const INTEREST_ONLY = ARGV.includes('--interest-only')
const SKIP_INTEREST = ARGV.includes('--skip-interest')
const DRY_RUN    = Boolean(WD_TEST) || Boolean(LF_TEST) || Boolean(SP_TEST) || Boolean(DG_TEST) || Boolean(FW_TEST)

let ENV = {}
try { ENV = loadEnv() }
catch (e) { if (!DRY_RUN) { console.error(e.message); process.exit(1) } }

const SUPABASE_URL = ENV['NEXT_PUBLIC_SUPABASE_URL']
const SUPABASE_KEY = ENV['SUPABASE_SERVICE_ROLE_KEY']
const YOUTUBE_KEY  = ENV['YOUTUBE_API_KEY']
// LASTFM_API_KEY: da .env.local; in mancanza ripiega su una variabile d'ambiente
// (comodo per il dry-run --lastfm-test senza .env.local).
const LASTFM_KEY   = ENV['LASTFM_API_KEY'] || process.env.LASTFM_API_KEY
// Spotify: stesso schema (env.local → process.env), per il dry-run senza .env.local.
const SPOTIFY_ID     = ENV['SPOTIFY_CLIENT_ID']     || process.env.SPOTIFY_CLIENT_ID
const SPOTIFY_SECRET = ENV['SPOTIFY_CLIENT_SECRET'] || process.env.SPOTIFY_CLIENT_SECRET
// Discogs: stesso schema (env.local → process.env), per il dry-run senza .env.local.
const DISCOGS_TOKEN  = ENV['DISCOGS_TOKEN'] || process.env.DISCOGS_TOKEN
// Folkways: chiave api.data.gov per la Smithsonian Open Access API. Stesso schema
// (env.local → process.env), per il dry-run --folkways-test senza .env.local.
const FOLKWAYS_KEY   = ENV['FOLKWAYS_API_KEY'] || process.env.FOLKWAYS_API_KEY
const APPLE_TOKEN    = ENV['APPLE_MUSIC_DEVELOPER_TOKEN'] || process.env.APPLE_MUSIC_DEVELOPER_TOKEN

let sb = null
if (!DRY_RUN) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@supabase/supabase-js')
  sb = createClient(SUPABASE_URL, SUPABASE_KEY)
}

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
  const data = await mbFetch(`/recording?artist=${mbId}&limit=${RECS_PER_ARTIST}&fmt=json&inc=tags+isrcs`)
  return data?.recordings || []
}

function getMbIsrc(recording) {
  const isrcs = recording.isrcs
  return (Array.isArray(isrcs) && isrcs.length) ? isrcs[0] : null
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

// Peso di una traccia derivato dalla relevance dell'artista (1–100).
// LEGACY: compresso da ceil(/10). Tenuto per la colonna `weight` (compat) e per
// i log relevance dell'artista. Il motore di pesca usa `quality_score` (sotto).
function weightFromRelevance(relevance) {
  return Math.max(1, Math.min(100, Math.ceil((relevance || 1) / 10)))
}

// Punteggio di pesca PER-BRANO, de-compresso (float, additivo) — sostituisce il
// ruolo di `weight` nel campionamento di /api/discover. Tre assi:
//   • riconoscibilità: listeners Last.fm reali (artista) con ampio range dinamico;
//     in mancanza ripiega sulla relevance MB (scala diversa ma stesso ordinamento).
//   • resa sonora: bonus se la traccia ha apple_music_id (riproduzione integrale).
//   • bonus per-brano: listeners per-traccia (track.getInfo), additivo → 0 se assente.
function qualityScore({ listeners, relevance, hasApple, trackListeners }) {
  const signal = (listeners != null && listeners > 0)
    ? listeners
    : Math.max(1, relevance || 1)
  const recog = Math.min(120, Math.round(Math.pow(Math.log10(signal + 10), 1.5) * 4))
  const reliability = hasApple ? 8 : 0
  const trackBonus = (trackListeners && trackListeners > 0)
    ? Math.round(4 * Math.log10(trackListeners + 10))
    : 0
  return recog + reliability + trackBonus
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

// ── Apple Music catalog search (ISRC → apple_music_id) ─────────────────────

let lastAppleCall = 0
const APPLE_DELAY_MS = 400

async function appleSearch(isrc) {
  if (!APPLE_TOKEN || !isrc) return null
  const wait = APPLE_DELAY_MS - (Date.now() - lastAppleCall)
  if (wait > 0) await sleep(wait)
  lastAppleCall = Date.now()
  try {
    const url = `https://api.music.apple.com/v1/catalog/it/songs?filter[isrc]=${encodeURIComponent(isrc)}&limit=1`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${APPLE_TOKEN}` } })
    if (!res.ok) return null
    const json = await res.json()
    return json?.data?.[0]?.id || null
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

// ── Wikidata (SPARQL) — fonte artisti complementare a MusicBrainz ────────────
// Endpoint pubblico, nessuna chiave. User-Agent descrittivo obbligatorio.
// Pausa >= 2 s tra le query per rispettare l'endpoint condiviso.

const WD_ENDPOINT          = 'https://query.wikidata.org/sparql'
const WD_DELAY_MS          = 2000
const WD_LIMIT_PER_COUNTRY = 300
let lastWdCall = 0

// Occupazioni (P106) considerate "musicista" + tipi di gruppo (P31).
// musician, singer, singer-songwriter, composer, songwriter, rapper, DJ,
// multi-instrumentalist, guitarist, musical-artist.
const WD_OCCUPATIONS = 'wd:Q639669 wd:Q177220 wd:Q488205 wd:Q36834 wd:Q753110 wd:Q2643890 wd:Q130857 wd:Q12800682 wd:Q855091 wd:Q386854'
// band, musical ensemble
const WD_GROUP_TYPES = 'wd:Q215380 wd:Q2088357'

function wdQuery(iso) {
  return `
SELECT DISTINCT ?artist ?artistLabel ?countryLabel ?mbid ?sitelinks ?article WHERE {
  ?country wdt:P297 "${iso}".
  {
    ?artist wdt:P27 ?country ; wdt:P106 ?occ .
    VALUES ?occ { ${WD_OCCUPATIONS} }
  } UNION {
    ?artist wdt:P31 ?gtype ; wdt:P495 ?country .
    VALUES ?gtype { ${WD_GROUP_TYPES} }
  }
  OPTIONAL { ?artist wdt:P434 ?mbid. }
  OPTIONAL { ?artist wikibase:sitelinks ?sitelinks. }
  OPTIONAL { ?article schema:about ?artist ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?sitelinks)
LIMIT ${WD_LIMIT_PER_COUNTRY}`
}

async function wdFetch(iso) {
  const wait = WD_DELAY_MS - (Date.now() - lastWdCall)
  if (wait > 0) await sleep(wait)
  lastWdCall = Date.now()
  const url = `${WD_ENDPOINT}?query=${encodeURIComponent(wdQuery(iso))}&format=json`
  const res = await withRetry('wdFetch', () => fetch(url, {
    headers: {
      'User-Agent': 'JamNet/1.0 (edoardoguerra88@gmail.com)',
      Accept: 'application/sparql-results+json',
    },
  }))
  if (res.status === 429) {
    console.warn('  Wikidata 429 (rate limit) — wait 30 s')
    await sleep(30000)
    return wdFetch(iso)
  }
  if (!res.ok) return []
  const data = await res.json()
  return data?.results?.bindings || []
}

function parseWdRow(r) {
  const qid = (r.artist?.value || '').split('/').pop()
  const article = r.article?.value
  const enwiki = article && article.includes('/wiki/')
    ? decodeURIComponent(article.split('/wiki/')[1])
    : null
  return {
    qid,
    name:         r.artistLabel?.value || qid,
    countryLabel: r.countryLabel?.value || null,
    mbid:         r.mbid?.value || null,
    sitelinks:    parseInt(r.sitelinks?.value || '0') || 0,
    enwiki,
  }
}

// Artisti Wikidata per codice ISO alpha-2. Deduplica per QID, scarta i non etichettati.
async function fetchArtistsFromWikidata(iso) {
  const rows = await wdFetch(iso)
  const out = []
  const seen = new Set()
  for (const r of rows) {
    const a = parseWdRow(r)
    if (!a.qid || seen.has(a.qid)) continue
    if (/^Q\d+$/.test(a.name)) continue   // etichetta mancante → salta
    seen.add(a.qid)
    out.push(a)
  }
  return out
}

// Rilevanza per artisti Wikidata: i sitelink (numero di edizioni Wikipedia)
// sono un buon proxy di notorietà, paragonabile al recording-count di MB.
function wdRelevance(sitelinks) {
  return Math.max(1, sitelinks * 3)
}

// ── Last.fm — segnale di rilevanza/tag ───────────────────────────────────────
// Fonte di SEGNALE (non enciclopedica): ascoltatori/play reali e tag d'uso.
// Read-only: basta la API key (lo shared secret serve solo per le scritture
// autenticate, qui non usate). Limite ~5 req/s: stiamo a ~4 (250 ms).
//
// Modello concordato: il segnale Last.fm MODULA la relevance esistente
// (MusicBrainz o Wikidata), non la sostituisce. Gli ascoltatori spaziano su ~3
// ordini di grandezza, quindi si usa un fattore log-scalato e limitato:
//   factor = clamp( log10(listeners + 10) / 3 , 0.5 , 2.0 )
// relevance_finale = round(relevance_base × factor); weight = weightFromRelevance.
// Così chi ha pubblico reale emerge di più e gli artisti senza ascolti vengono
// smorzati, senza che una megastar (milioni di ascoltatori) saturi la pesca.

const LASTFM_ENDPOINT = 'https://ws.audioscrobbler.com/2.0/'
const LASTFM_DELAY_MS = 250   // ~4 req/s, conservativo sotto il limite di 5/s
let lastLfCall = 0

async function lfFetch(params) {
  const wait = LASTFM_DELAY_MS - (Date.now() - lastLfCall)
  if (wait > 0) await sleep(wait)
  lastLfCall = Date.now()
  const qs = new URLSearchParams({ ...params, api_key: LASTFM_KEY, format: 'json' }).toString()
  const res = await withRetry('lfFetch', () => fetch(`${LASTFM_ENDPOINT}?${qs}`, {
    headers: { 'User-Agent': 'JamNet/1.0 (edoardoguerra88@gmail.com)' },
  }))
  if (res.status === 429) {
    console.warn('  Last.fm 429 (rate limit) — wait 20 s')
    await sleep(20000)
    return lfFetch(params)
  }
  if (!res.ok) return null
  const data = await res.json()
  if (data.error) return null   // 6 = not found, 8 = operation failed, ecc.
  return data
}

// Fattore di modulazione log-scalato e limitato a [0.5, 2.0].
function lastfmFactor(listeners) {
  const f = Math.log10((listeners || 0) + 10) / 3
  return Math.max(0.5, Math.min(2.0, f))
}

// artist.getInfo: preferisce il MusicBrainz ID (match esatto); in mancanza usa il
// nome con autocorrect. Se l'mbid non è noto a Last.fm, ripiega sul nome.
async function lastfmArtistInfo({ mbid, name }) {
  let d = mbid ? await lfFetch({ method: 'artist.getinfo', mbid }) : null
  if ((!d || !d.artist?.stats) && name) {
    d = await lfFetch({ method: 'artist.getinfo', artist: name, autocorrect: '1' })
  }
  const ar = d?.artist
  if (!ar || !ar.stats) return null
  return {
    listeners: parseInt(ar.stats.listeners) || 0,
    playcount: parseInt(ar.stats.playcount) || 0,
    tags:      (ar.tags?.tag || []).map(t => (t.name || '').toLowerCase()).filter(Boolean).slice(0, 6),
    mbid:      ar.mbid || null,
  }
}

// track.getInfo: segnale PER-BRANO. Preferisce il MusicBrainz ID; in mancanza usa
// artist+track con autocorrect. Usato dallo stage opzionale --lastfm-tracks.
async function lastfmTrackInfo({ mbid, artist, track }) {
  let d = mbid ? await lfFetch({ method: 'track.getinfo', mbid }) : null
  if ((!d || !d.track) && artist && track) {
    d = await lfFetch({ method: 'track.getinfo', artist, track, autocorrect: '1' })
  }
  const tr = d?.track
  if (!tr) return null
  return {
    listeners: parseInt(tr.listeners) || 0,
    playcount: parseInt(tr.playcount) || 0,
  }
}

// Unisce tag esistenti + tag Last.fm, deduplicati (case-insensitive), max 8.
function mergeTags(existing, lfTags) {
  const out = []
  const seen = new Set()
  for (const t of [...(existing || []), ...(lfTags || [])]) {
    const k = (t || '').toLowerCase().trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(t)
    if (out.length >= 8) break
  }
  return out
}

// Tutti gli artisti in catalogo (paginato), con relevance per la modulazione.
async function loadAllArtists() {
  const out = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb.from('artists')
      .select('mb_artist_id, name, country, relevance')
      .range(from, from + PAGE - 1)
    if (error || !data?.length) break
    out.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

// Aggiorna le tracce dell'artista con i segnali Last.fm: il peso legacy (bulk),
// il `quality_score` PER-BRANO (de-compresso, dai listeners dell'artista + la
// riproducibilità e gli eventuali listeners per-traccia del singolo brano) e,
// dove i tag mancano, il backfill dei tag Last.fm (non sovrascrive i tag MB).
async function applyLastfmToTracks(artistId, { weight, listeners, lfTags }) {
  await withRetry('lastfm:updateTracksWeight', async () => {
    const { error } = await sb.from('tracks').update({ weight }).eq('artist_mb_id', artistId)
    if (error) console.warn('  update tracks weight:', error.message)
  })
  const { data: tracks } = await sb.from('tracks')
    .select('id, tags, apple_music_id, track_listeners').eq('artist_mb_id', artistId)
  for (const t of tracks || []) {
    const update = {
      quality_score: qualityScore({
        listeners,
        hasApple: !!t.apple_music_id,
        trackListeners: t.track_listeners,
      }),
    }
    // backfill tag solo dove mancano (non tocco le tracce già taggate da MB)
    if (lfTags?.length && !(t.tags && t.tags.length)) {
      const merged = mergeTags(t.tags, lfTags)
      if (merged.length) update.tags = merged
    }
    await withRetry('lastfm:updateTrack', async () => {
      const { error } = await sb.from('tracks').update(update).eq('id', t.id)
      if (error) console.warn('  update track:', error.message)
    })
  }
}

// Stage Last.fm: per ogni artista in catalogo recupera il segnale, modula la
// relevance e aggiorna i pesi delle sue tracce. Idempotente: il checkpoint
// (cp.lastfmDone[id]) garantisce un solo passaggio per artista, così rilanci
// successivi non ricompongono il fattore sulla relevance già modulata.
async function runLastfmStage(cp) {
  console.log('\n════════════════════════════════════════════════════════════')
  console.log('  LAST.FM — segnale di rilevanza/tag per gli artisti in catalogo')
  console.log('════════════════════════════════════════════════════════════')
  if (!LASTFM_KEY) {
    console.warn('  LASTFM_API_KEY mancante in .env.local — salto lo stage Last.fm')
    return
  }

  cp.lastfmDone     = cp.lastfmDone     || {}
  cp.lastfmEnriched = cp.lastfmEnriched || 0
  cp.lastfmNotFound = cp.lastfmNotFound || 0

  const artists = await loadAllArtists()
  console.log(`  ${artists.length} artisti in catalogo`)

  for (const a of artists) {
    const id = a.mb_artist_id
    if (!id || cp.lastfmDone[id]) continue

    // Gli id sintetici (wd:/sp:/lf:/dg:) non sono MBID validi: per loro Last.fm
    // va interrogato per nome, non per mbid.
    const realMbid = /^(wd|sp|lf|dg):/.test(id) ? null : id
    let info
    try {
      info = await lastfmArtistInfo({ mbid: realMbid, name: a.name })
    } catch (err) {
      console.warn(`\n  Last.fm ${a.name} failed: ${err.message}`)
      continue
    }

    if (!info) {
      cp.lastfmDone[id] = { notFound: true }
      cp.lastfmNotFound++
      saveCheckpoint(cp)
      continue
    }

    const base      = Math.max(1, a.relevance || 1)
    const factor    = lastfmFactor(info.listeners)
    const newRel    = Math.max(1, Math.round(base * factor))
    const oldWeight = weightFromRelevance(base)
    const newWeight = weightFromRelevance(newRel)

    await withRetry('lastfm:updateArtist', async () => {
      const { error } = await sb.from('artists')
        .update({ relevance: newRel, listeners: info.listeners, playcount: info.playcount })
        .eq('mb_artist_id', id)
      if (error) console.warn('  update artist relevance:', error.message)
    })
    await applyLastfmToTracks(id, { weight: newWeight, listeners: info.listeners, lfTags: info.tags })

    cp.lastfmDone[id] = {
      listeners: info.listeners, playcount: info.playcount,
      factor: +factor.toFixed(2), base, newRel,
    }
    cp.lastfmEnriched++
    saveCheckpoint(cp)
    process.stdout.write(
      `\r  ${String(cp.lastfmEnriched).padStart(5)} arricchiti  ${a.name.slice(0, 26).padEnd(26)} ` +
      `${String(info.listeners).padStart(8)} list  ×${factor.toFixed(2)}  w:${oldWeight}→${newWeight}   `
    )
  }
  console.log(`\n  Last.fm: ${cp.lastfmEnriched} artisti arricchiti, ${cp.lastfmNotFound} non trovati`)
}

// ── Last.fm — segnale PER-BRANO (stage OPZIONALE, gated da --lastfm-tracks) ──
// Ibrido pragmatico: la base di riconoscibilità resta l'artista (runLastfmStage);
// qui si aggiunge un bonus per-brano solo dove ha senso e costa poco, cioè per le
// tracce degli artisti ad alti ascolti (dove il singolo brano ri-ordina davvero il
// catalogo dell'artista). Idempotente: cp.lastfmTrackDone[trackId] → un solo pass.
const LF_TRACKS_MIN_LISTENERS = 50000

async function loadHighListenerArtists(minListeners) {
  const out = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb.from('artists')
      .select('mb_artist_id, name, listeners')
      .gte('listeners', minListeners)
      .range(from, from + PAGE - 1)
    if (error || !data?.length) break
    out.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

async function runLastfmTracksStage(cp) {
  console.log('\n════════════════════════════════════════════════════════════')
  console.log('  LAST.FM — segnale per-brano (track.getInfo) per artisti ad alti ascolti')
  console.log('════════════════════════════════════════════════════════════')
  if (!LASTFM_KEY) {
    console.warn('  LASTFM_API_KEY mancante in .env.local — salto lo stage Last.fm tracks')
    return
  }

  cp.lastfmTrackDone      = cp.lastfmTrackDone      || {}
  cp.lastfmTracksEnriched = cp.lastfmTracksEnriched || 0

  const artists = await loadHighListenerArtists(LF_TRACKS_MIN_LISTENERS)
  console.log(`  ${artists.length} artisti sopra ${LF_TRACKS_MIN_LISTENERS} ascoltatori`)

  for (const a of artists) {
    const { data: tracks } = await sb.from('tracks')
      .select('id, title, artist_name, mb_recording_id, apple_music_id')
      .eq('artist_mb_id', a.mb_artist_id)
      .is('track_listeners', null)

    for (const t of tracks || []) {
      if (cp.lastfmTrackDone[t.id]) continue
      const realMbid = t.mb_recording_id && !/^(wd|sp|lf|dg):/.test(t.mb_recording_id)
        ? t.mb_recording_id : null
      let info
      try {
        info = await lastfmTrackInfo({ mbid: realMbid, artist: t.artist_name, track: t.title })
      } catch (err) {
        console.warn(`\n  Last.fm track ${t.title} failed: ${err.message}`)
        continue
      }
      const trackListeners = info?.listeners ?? 0
      const qs = qualityScore({
        listeners: a.listeners,
        hasApple: !!t.apple_music_id,
        trackListeners: trackListeners,
      })
      await withRetry('lastfmTracks:update', async () => {
        const { error } = await sb.from('tracks')
          .update({ track_listeners: trackListeners, quality_score: qs }).eq('id', t.id)
        if (error) console.warn('  update track listeners:', error.message)
      })
      cp.lastfmTrackDone[t.id] = { listeners: trackListeners }
      cp.lastfmTracksEnriched++
      saveCheckpoint(cp)
      process.stdout.write(
        `\r  ${String(cp.lastfmTracksEnriched).padStart(6)} brani  ${t.title.slice(0, 30).padEnd(30)} ` +
        `${String(trackListeners).padStart(8)} list   `
      )
    }
  }
  console.log(`\n  Last.fm tracks: ${cp.lastfmTracksEnriched} brani arricchiti`)
}

// ── Last.fm — scoperta nuovi artisti (stage OPZIONALE, gated da --lastfm-discover) ──
// Stesso trattamento duplicati della sessione Wikidata: dedup per mb_artist_id e
// per nome+paese. geo.getTopArtists dà artisti per paese (con listeners); per i
// generi usa tag.getTopArtists. Gli artisti con MBID caricano anche le tracce.

const LF_DISCOVER_PER_COUNTRY = 50
const LF_DISCOVER_PER_TAG     = 30

function lfDiscoveryRelevance(listeners) {
  // Niente base MB: relevance derivata dal solo pubblico Last.fm (log-scalata),
  // su scala comparabile a wdRelevance (sitelink×3).
  return Math.max(1, Math.round(Math.log10((listeners || 0) + 10) * 15))
}

async function lfTopArtistsByCountry(countryName) {
  const d = await lfFetch({ method: 'geo.gettopartists', country: countryName, limit: LF_DISCOVER_PER_COUNTRY })
  return (d?.topartists?.artist || []).map(a => ({
    name: a.name, mbid: a.mbid || null, listeners: parseInt(a.listeners) || 0,
  }))
}

async function lfTopArtistsByTag(tag) {
  const d = await lfFetch({ method: 'tag.gettopartists', tag, limit: LF_DISCOVER_PER_TAG })
  return (d?.topartists?.artist || []).map(a => ({
    name: a.name, mbid: a.mbid || null,
    // tag.getTopArtists non dà listeners: stima dalla posizione in classifica.
    rank: parseInt(a['@attr']?.rank) || 999, listeners: 0,
  }))
}

async function runLastfmDiscoverStage(cp) {
  console.log('\n════════════════════════════════════════════════════════════')
  console.log('  LAST.FM — scoperta nuovi artisti (geo + tag)')
  console.log('════════════════════════════════════════════════════════════')
  if (!LASTFM_KEY) { console.warn('  LASTFM_API_KEY mancante — salto la scoperta'); return }

  cp.lastfmDiscover     = cp.lastfmDiscover     || {}
  cp.lastfmDiscoverNew  = cp.lastfmDiscoverNew  || 0

  const existing = await loadExistingArtists()
  const areaEntries = Object.entries(REGIONS)
    .filter(([k, v]) => k !== '_comment' && v && Array.isArray(v.musicbrainz_countries))

  for (const [area, region] of areaEntries) {
    const candidates = []
    for (const countryName of region.musicbrainz_countries) {
      const key = `geo::${countryName}`
      if (cp.lastfmDiscover[key]) continue
      let top = []
      try { top = await lfTopArtistsByCountry(countryName) }
      catch (err) { console.warn(`  geo ${countryName} failed: ${err.message}`); continue }
      for (const t of top) candidates.push({ ...t, country: countryName })
      cp.lastfmDiscover[key] = top.length
      saveCheckpoint(cp)
    }
    for (const tag of (region.genre_seeds || [])) {
      const key = `tag::${tag}`
      if (cp.lastfmDiscover[key]) continue
      let top = []
      try { top = await lfTopArtistsByTag(tag) }
      catch (err) { console.warn(`  tag ${tag} failed: ${err.message}`); continue }
      for (const t of top) candidates.push({ ...t, country: null })
      cp.lastfmDiscover[key] = top.length
      saveCheckpoint(cp)
    }

    let added = 0
    for (const c of candidates) {
      if (!c.name) continue
      const nameKey = `${c.name.toLowerCase()}::${(c.country || '').toLowerCase()}`
      if (c.mbid && existing.mbids.has(c.mbid)) continue
      if (existing.nameCountry.has(nameKey)) continue
      const artistId = c.mbid || `lf:${c.name.toLowerCase().replace(/\s+/g, '-')}`
      if (existing.mbids.has(artistId)) continue

      // Segnale ufficiale: arricchisce listeners (e mbid) anche per i candidati da tag.
      const info = await lastfmArtistInfo({ mbid: c.mbid, name: c.name })
      const listeners = info?.listeners || c.listeners || 0
      const relevance = lfDiscoveryRelevance(listeners)
      const realMbid  = info?.mbid || c.mbid || null

      await upsertArtist({
        mb_artist_id: realMbid || artistId,
        name:         c.name,
        country:      c.country,
        macro_area:   area,
        bio_short:    null,
        relevance,
      })
      existing.mbids.add(realMbid || artistId)
      existing.nameCountry.add(nameKey)

      if (realMbid) {
        await processRecordings({
          name: c.name, mbId: realMbid, country: c.country, area, relevance,
        }, cp)
      }
      added++
      cp.lastfmDiscoverNew++
    }
    saveCheckpoint(cp)
    console.log(`  ${area.padEnd(20)} +${added} nuovi candidati`)
  }
  console.log(`\n  Last.fm scoperta: ${cp.lastfmDiscoverNew} artisti nuovi`)
}

// ── Last.fm dry-run test (nessuna scrittura) ─────────────────────────────────
// Per un campione di artisti: recupera il segnale Last.fm, ricostruisce la
// relevance base da MusicBrainz (recording-count, stessa formula del catalogo)
// e mostra relevance/weight PRIMA e DOPO la modulazione. Funziona senza .env.local.

const LF_TEST_SAMPLE = [
  'Fela Kuti', 'Mulatu Astatke', 'Tinariwen', 'Oum Kalthoum',
  'Caetano Veloso', 'Nusrat Fateh Ali Khan', 'Ali Farka Touré', 'Cesária Évora',
]

// recording-count da MusicBrainz (proxy della relevance base MB), per mbid o nome.
async function mbRecordingCount({ mbid, name }) {
  let id = mbid
  if (!id && name) {
    const s = await mbFetch(`/artist?query=${encodeURIComponent(`artist:"${name}"`)}&limit=1&fmt=json`)
    id = s?.artists?.[0]?.id || null
  }
  if (!id) return 0
  const browse = await mbFetch(`/recording?artist=${id}&limit=1&fmt=json`)
  return parseInt(browse?.['recording-count']) || 0
}

async function runLastfmTest(names) {
  console.log('JamNet — Last.fm test (dry run, nessuna scrittura)\n')
  if (!LASTFM_KEY) { console.error('  LASTFM_API_KEY mancante in .env.local'); return }

  console.log('  ' + 'artista'.padEnd(24) + '  listeners  factor   relevance(base→new)   weight(old→new)   tag Last.fm')
  console.log('  ' + '─'.repeat(110))
  for (const name of names) {
    const info = await lastfmArtistInfo({ mbid: null, name })
    if (!info) { console.log('  ' + name.slice(0, 24).padEnd(24) + '  (non trovato su Last.fm)'); continue }

    let base = 1
    try { base = Math.max(1, await mbRecordingCount({ mbid: info.mbid, name })) } catch { /* best-effort */ }

    const factor = lastfmFactor(info.listeners)
    const newRel = Math.max(1, Math.round(base * factor))
    const oldW   = weightFromRelevance(base)
    const newW   = weightFromRelevance(newRel)
    console.log(
      '  ' + name.slice(0, 24).padEnd(24) +
      '  ' + String(info.listeners).padStart(8) +
      '   ×' + factor.toFixed(2) +
      '    ' + String(base).padStart(5) + '→' + String(newRel).padStart(6) +
      '         ' + String(oldW).padStart(3) + '→' + String(newW).padStart(3) +
      '          ' + info.tags.slice(0, 4).join(', ')
    )
  }
  console.log('\nFatto (dry run).')
}

// ── Spotify — scoperta artisti correlati (Client Credentials Flow) ───────────
// Fonte di SCOPERTA (come Wikidata): fa emergere nomi minori vicini ad artisti
// già noti in catalogo. Non serve login utente: il Client Credentials Flow
// scambia client_id/secret per un access token (valido ~1 h, rinnovato in automatico).
//
// Approccio a SEMI: lo stage NON gira su tutto il catalogo, ma parte dai semi a
// relevance più alta (i nomi noti) — da lì related-artists fa affiorare i correlati,
// tra cui i minori. Girare sull'intero catalogo sarebbe sprecato (i correlati di un
// artista oscuro sono spesso già noti, o oscuri e ridondanti) e moltiplicherebbe le
// chiamate API. Numero di semi configurabile con --spotify-seeds=N (default 200).
//
// IMPORTANTE: la Web API di Spotify richiede che il PROPRIETARIO dell'app abbia un
// abbonamento Premium attivo; in mancanza OGNI endpoint dati risponde 403
// ("Active premium subscription required for the owner of the app"). L'endpoint
// related-artists è inoltre deprecato da Spotify (27/11/2024) per le app create dopo
// quella data. Lo stage rileva il 403, lo segnala una volta e prosegue senza
// interrompere la pipeline (spBlocked).

const SP_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token'
const SP_API            = 'https://api.spotify.com/v1'
const SP_DELAY_MS       = 200   // ~5 req/s, conservativo (Spotify usa un rate limit a finestra mobile)
let   spToken    = null
let   spTokenExp = 0
let   lastSpCall = 0
let   spBlocked  = false        // true dopo un 403 (premium/deprecazione): non insistere

// Client Credentials Flow: client_id/secret → access token. Cache fino a scadenza.
async function spotifyToken() {
  if (spToken && Date.now() < spTokenExp - 60_000) return spToken
  const res = await withRetry('spotifyToken', () => fetch(SP_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${SPOTIFY_ID}:${SPOTIFY_SECRET}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  }))
  if (!res.ok) throw new Error(`token ${res.status}`)
  const data = await res.json()
  spToken    = data.access_token
  spTokenExp = Date.now() + (data.expires_in || 3600) * 1000
  return spToken
}

// fetch verso la Web API: rate-limited, rinnova il token su 401, rispetta
// Retry-After su 429, segnala (una volta) il blocco 403 premium/deprecazione.
async function spFetch(path) {
  if (spBlocked) return { blocked: true }
  const wait = SP_DELAY_MS - (Date.now() - lastSpCall)
  if (wait > 0) await sleep(wait)
  lastSpCall = Date.now()
  const token = await spotifyToken()
  let res = await withRetry('spFetch', () => fetch(`${SP_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  }))
  if (res.status === 401) {            // token scaduto: rinnova e riprova una volta
    spToken = null
    const t2 = await spotifyToken()
    res = await withRetry('spFetch', () => fetch(`${SP_API}${path}`, { headers: { Authorization: `Bearer ${t2}` } }))
  }
  if (res.status === 429) {            // rate limit: rispetta l'header Retry-After (secondi)
    const retry = parseInt(res.headers.get('retry-after') || '5')
    console.warn(`  Spotify 429 (rate limit) — wait ${retry + 1}s`)
    await sleep((retry + 1) * 1000)
    return spFetch(path)
  }
  if (res.status === 403) {
    const body = await res.text().catch(() => '')
    spBlocked = true
    console.warn(`  Spotify 403 — ${body.slice(0, 140)}`)
    return { blocked: true }
  }
  if (!res.ok) return null            // 404 e altri: nessun risultato
  return res.json()
}

// Trova l'artista Spotify corrispondente a un nome di catalogo (match per nome).
async function spotifySearchArtist(name) {
  const d = await spFetch(`/search?q=${encodeURIComponent(name)}&type=artist&limit=1`)
  if (d?.blocked) return { blocked: true }
  return d?.artists?.items?.[0] || null
}

async function spotifyRelatedArtists(spotifyId) {
  const d = await spFetch(`/artists/${spotifyId}/related-artists`)
  if (d?.blocked) return { blocked: true }
  return d?.artists || []
}

// Relevance per artisti scoperti via Spotify: dai follower (log-scalata), su scala
// comparabile a wdRelevance (sitelink×3) e lfDiscoveryRelevance.
function spRelevance(followers) {
  return Math.max(1, Math.round(Math.log10((followers || 0) + 10) * 15))
}

// Semi: gli artisti del catalogo a relevance più alta. Da questi Spotify trova i
// correlati, tra cui emergono i nomi minori vicini.
async function loadSeedArtists(limit) {
  const { data, error } = await sb.from('artists')
    .select('mb_artist_id, name, country, macro_area, relevance')
    .order('relevance', { ascending: false })
    .limit(limit)
  if (error) { console.warn('  loadSeedArtists:', error.message); return [] }
  return data || []
}

// Stage Spotify: per ogni seme cerca l'artista su Spotify, ne prende i correlati e
// inserisce quelli non ancora in catalogo. Stesso trattamento anti-duplicati di
// Wikidata (per id sintetico "sp:<spotifyId>" e per nome+paese) e stessa integrazione
// delle sessioni precedenti (checkpoint cp.spotifyDone[seedId]). Gli artisti
// "solo Spotify" non hanno tracce MB: restano coperti quando emergono altrove (iTunes),
// coerentemente con gli artisti solo-Wikidata.
async function runSpotifyStage(cp) {
  console.log('\n════════════════════════════════════════════════════════════')
  console.log('  SPOTIFY — scoperta artisti correlati (da semi ad alta relevance)')
  console.log('════════════════════════════════════════════════════════════')
  if (!SPOTIFY_ID || !SPOTIFY_SECRET) {
    console.warn('  SPOTIFY_CLIENT_ID/SECRET mancanti in .env.local — salto lo stage Spotify')
    return
  }
  try { await spotifyToken() }
  catch (e) { console.warn(`  Spotify auth fallita (${e.message}) — salto lo stage`); return }

  cp.spotifyDone      = cp.spotifyDone      || {}
  cp.spotifyNew       = cp.spotifyNew       || 0
  cp.spotifySeedsDone = cp.spotifySeedsDone || 0

  const existing = await loadExistingArtists()
  const seeds = await loadSeedArtists(SP_SEEDS)
  console.log(`  ${seeds.length} semi (top per relevance, soglia ${SP_SEEDS})`)

  for (const seed of seeds) {
    const seedId = seed.mb_artist_id
    if (!seedId || cp.spotifyDone[seedId]) continue
    if (spBlocked) { console.warn('\n  Spotify bloccato (403) — interrompo lo stage'); break }

    let sp
    try { sp = await spotifySearchArtist(seed.name) }
    catch (err) { console.warn(`\n  Spotify search ${seed.name} failed: ${err.message}`); continue }
    if (sp?.blocked) break
    if (!sp) { cp.spotifyDone[seedId] = { noMatch: true }; saveCheckpoint(cp); continue }

    let related
    try { related = await spotifyRelatedArtists(sp.id) }
    catch (err) { console.warn(`\n  Spotify related ${seed.name} failed: ${err.message}`); continue }
    if (related?.blocked) break

    let added = 0
    for (const r of (related || [])) {
      if (!r.name || !r.id) continue
      const spKey   = `sp:${r.id}`
      const nameKey = `${r.name.toLowerCase()}::${(seed.country || '').toLowerCase()}`
      if (existing.mbids.has(spKey)) continue
      if (existing.nameCountry.has(nameKey)) continue

      await upsertArtist({
        mb_artist_id: spKey,
        name:         r.name,
        country:      seed.country,      // scena vicina: eredita il paese del seme
        macro_area:   seed.macro_area,
        bio_short:    null,
        relevance:    spRelevance(r.followers?.total),
      })
      existing.mbids.add(spKey)
      existing.nameCountry.add(nameKey)
      added++
      cp.spotifyNew++
    }
    cp.spotifyDone[seedId] = { sp: sp.id, related: (related || []).length, added }
    cp.spotifySeedsDone++
    saveCheckpoint(cp)
    process.stdout.write(
      `\r  ${String(cp.spotifySeedsDone).padStart(4)} semi  ${seed.name.slice(0, 26).padEnd(26)} +${added} correlati nuovi   `
    )
  }
  console.log(`\n  Spotify: ${cp.spotifyNew} artisti correlati nuovi da ${cp.spotifySeedsDone} semi`)
}

// ── Spotify dry-run test (nessuna scrittura) ─────────────────────────────────
// Autentica (Client Credentials), cerca un campione di artisti e stampa i correlati.
// Funziona senza .env.local (credenziali da env). Riporta chiaramente se la Web API
// è bloccata (403 premium/deprecazione), distinguendolo dall'auth (che resta valida).

const SP_TEST_SAMPLE = [
  'Fela Kuti', 'Tinariwen', 'Mulatu Astatke',
  'Cesária Évora', 'Ali Farka Touré', 'Caetano Veloso',
]

async function runSpotifyTest(names) {
  console.log('JamNet — Spotify test (dry run, nessuna scrittura)\n')
  if (!SPOTIFY_ID || !SPOTIFY_SECRET) { console.error('  SPOTIFY_CLIENT_ID/SECRET mancanti'); return }
  try { await spotifyToken(); console.log('  Auth Client Credentials: OK (access token ottenuto)\n') }
  catch (e) { console.error(`  Auth fallita: ${e.message}`); return }

  let totalRelated = 0, matched = 0
  for (const name of names) {
    const sp = await spotifySearchArtist(name)
    if (sp?.blocked) {
      console.log('\n  ⚠ Web API bloccata (403): lo stage non può scoprire correlati.')
      console.log('    Cause tipiche:')
      console.log('    · il proprietario dell\'app non ha un abbonamento Spotify Premium attivo;')
      console.log('    · related-artists è deprecato per le app create dopo il 27/11/2024.')
      console.log('    L\'autenticazione invece funziona: il token viene rilasciato.')
      return
    }
    if (!sp) { console.log('  ' + name.padEnd(24) + '  (non trovato su Spotify)'); continue }
    const related = await spotifyRelatedArtists(sp.id)
    if (related?.blocked) { console.log('\n  ⚠ related-artists bloccato (403) — vedi nota sopra.'); return }
    matched++
    totalRelated += related.length
    console.log(`  ${name.padEnd(24)} → "${sp.name}"  pop ${sp.popularity}  ${sp.followers?.total || 0} follower`)
    console.log(`    ${related.length} correlati: ` + related.slice(0, 8).map(r => r.name).join(', '))
  }
  console.log(`\n  ${matched}/${names.length} semi risolti, ${totalRelated} correlati totali. Fatto (dry run).`)
}

// ── Discogs — uscite indipendenti/locali assenti da MusicBrainz ──────────────
// Fonte di RIEMPIMENTO per i buchi del catalogo: Discogs indicizza moltissime
// uscite locali/indipendenti (vinili, cassette, piccole etichette) che MusicBrainz
// spesso non ha. Si interroga per PAESE + ANNO sulle aree sotto soglia (sez. 3.2),
// decennio per decennio.
//
// Niente mb_recording_id per i brani Discogs: si usano chiavi sintetiche, coerenti
// con la convenzione wd:/sp:/lf: già in uso —
//   artista:  mb_artist_id   = "dg:<discogs_artist_id>"
//   traccia:  mb_recording_id = "dg:<release_id>:<position>"
// Anti-duplicati (deciso col proprietario): match STRETTO su titolo+artista+anno
// normalizzati contro il catalogo esistente (vedi loadExistingTrackKeys).
// Nota: l'anno Discogs è quello della stampa, l'anno MB è quello di prima
// pubblicazione: con match stretto lo stesso brano con anni diversi NON viene
// fuso (può quindi entrare una seconda volta) — comportamento accettato.
//
// Rate limit: 60 richieste/minuto con token autenticato → 1 richiesta ~ogni 1.1 s.
// La ricerca dà solo "Artista – Album"; per i veri titoli dei brani e per nomi
// artista puliti si scarica il dettaglio della release (1 richiesta ciascuna).

const DISCOGS_API        = 'https://api.discogs.com'
const DG_DELAY_MS        = 1100   // 60 req/min autenticato → ~1 req ogni 1.1 s
const DG_PER_PAGE        = 100
const DG_PAGES_PER_YEAR  = 3      // max 300 release/anno: tetto al costo di ricerca
const DG_RELEASES_PER_CD = 25     // max dettagli release per (paese, decennio) per run
const DG_DETAILS_PER_RUN = 800    // budget complessivo di dettagli release per run (~15 min)
const DG_THRESHOLD       = 200    // soglia brani riproducibili per area (sez. 3.2)
let lastDgCall = 0

async function dgFetch(path) {
  if (!DISCOGS_TOKEN) return null
  const wait = DG_DELAY_MS - (Date.now() - lastDgCall)
  if (wait > 0) await sleep(wait)
  lastDgCall = Date.now()
  const sep = path.includes('?') ? '&' : '?'
  const url = `${DISCOGS_API}${path}${sep}token=${DISCOGS_TOKEN}`
  const res = await withRetry('dgFetch', () => fetch(url, {
    headers: { 'User-Agent': 'JamNet/1.0 (edoardoguerra88@gmail.com)' },
  }))
  if (res.status === 429) {            // rate limit: rispetta Retry-After (secondi)
    const retry = parseInt(res.headers.get('retry-after') || '60')
    console.warn(`  Discogs 429 (rate limit) — wait ${retry}s`)
    await sleep((retry || 60) * 1000)
    return dgFetch(path)
  }
  if (!res.ok) return null
  return res.json()
}

async function dgSearchReleases(country, year, page) {
  const d = await dgFetch(`/database/search?type=release&country=${encodeURIComponent(country)}&year=${year}&per_page=${DG_PER_PAGE}&page=${page}`)
  return d || { results: [], pagination: { pages: 0 } }
}

async function dgReleaseDetail(id) {
  return dgFetch(`/releases/${id}`)
}

// Pulisce i nomi artista Discogs: toglie il suffisso di disambiguazione " (123)"
// e l'asterisco delle varianti ortografiche ("Nome*").
function cleanDiscogsName(name) {
  return (name || '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/\*+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Tag dai generi/stili Discogs: gli "styles" sono più specifici dei "genres".
function dgTags(detail) {
  const out = []
  const seen = new Set()
  for (const t of [...(detail.styles || []), ...(detail.genres || [])]) {
    const k = (t || '').toLowerCase().trim()
    if (!k || seen.has(k)) continue
    seen.add(k); out.push(k)
    if (out.length >= 8) break
  }
  return out
}

// Relevance base per artisti Discogs: proxy dal n. di brani trovati (Last.fm la
// modula poi). Scala comparabile a wdRelevance/spRelevance.
function dgRelevance(trackCount) {
  return Math.max(1, Math.min(300, (trackCount || 1) * 5))
}

// Normalizzazione per il match anti-duplicati (titolo/artista): minuscolo, senza
// diacritici, solo alfanumerici e spazi singoli.
function normKey(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Chiave-contenuto STRETTA per il dedup dei brani: titolo+artista+anno (decisa
// col proprietario). L'anno entra nella chiave: due brani omonimi dello stesso
// artista ma di anni diversi restano distinti.
function trackContentKey(title, artist, year) {
  return `${normKey(title)}::${normKey(artist)}::${year || ''}`
}

// Artisti della release, puliti e deduplicati per id; scarta "Various" (compilation).
function releaseArtistList(detail) {
  const out = []
  const seen = new Set()
  for (const a of (detail.artists || [])) {
    const name = cleanDiscogsName(a.name)
    if (!name || /^various$/i.test(name)) continue
    if (a.id && seen.has(a.id)) continue
    if (a.id) seen.add(a.id)
    out.push({ id: a.id, name })
  }
  return out
}

// Estrae da Discogs i brani per (paese, decennio): cerca le release di ogni anno
// del decennio, scarica i dettagli (fino a maxDetails) e restituisce artisti e
// brani normalizzati. Condiviso da stage e dry-run.
async function collectDiscogsTracks(country, decade, maxDetails) {
  const releases = []
  const seenRel = new Set()
  for (let y = decade; y < decade + 10; y++) {
    let page = 1, pages = 1
    do {
      const d = await dgSearchReleases(country, y, page)
      for (const r of (d.results || [])) {
        if (r.id && !seenRel.has(r.id)) { seenRel.add(r.id); releases.push({ id: r.id, year: parseInt(r.year) || y }) }
      }
      pages = d.pagination?.pages || 1
      page++
    } while (page <= pages && page <= DG_PAGES_PER_YEAR)
  }

  const artists = new Map()   // dgId → { id, name, count }
  const tracks = []
  let details = 0
  for (const rel of releases) {
    if (details >= maxDetails) break
    const detail = await dgReleaseDetail(rel.id)
    details++
    if (!detail) continue
    const ras = releaseArtistList(detail)
    if (!ras.length) continue              // compilation/Various: salta
    const primary = ras[0]
    const tags = dgTags(detail)
    const year = parseInt(detail.year) || rel.year || null
    let count = 0
    for (const t of (detail.tracklist || [])) {
      if (!t.title) continue
      if (t.type_ && t.type_ !== 'track') continue   // salta heading/index
      if (JUNK_RE.test(t.title)) continue
      const tArtist = (t.artists?.length)
        ? t.artists.map(a => cleanDiscogsName(a.name)).filter(Boolean).join(' & ')
        : primary.name
      tracks.push({
        releaseId: rel.id,
        position:  t.position || `t${tracks.length}`,
        title:     t.title.trim(),
        artistName: tArtist || primary.name,
        artistId:  primary.id,
        year, tags,
      })
      count++
    }
    const ar = artists.get(primary.id) || { id: primary.id, name: primary.name, count: 0 }
    ar.count += count
    artists.set(primary.id, ar)
  }
  return { artists, tracks, releases: releases.length, details }
}

// Conteggio brani riproducibili per area (stessa logica di logSummary).
async function areaPlayableCount(area) {
  const { count } = await sb.from('tracks').select('*', { count: 'exact', head: true })
    .eq('macro_area', area).not('apple_music_id', 'is', null)
  return count || 0
}

// Chiavi-contenuto dei brani già in catalogo, per il dedup stretto. Paginato.
async function loadExistingTrackKeys() {
  const keys = new Set()
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb.from('tracks')
      .select('title, artist_name, year')
      .range(from, from + PAGE - 1)
    if (error || !data?.length) break
    for (const t of data) keys.add(trackContentKey(t.title, t.artist_name, t.year))
    if (data.length < PAGE) break
    from += PAGE
  }
  return keys
}

// Stage Discogs: per ogni area sotto soglia (sez. 3.2), interroga Discogs per
// (paese, decennio), deduplica artisti (per dg:id e nome+paese) e brani (stretto
// titolo+artista+anno), inserisce i nuovi e tenta l'abbinamento riproducibile
// (YouTube se resta quota, altrimenti anteprima iTunes). Checkpoint per (area,
// paese, decennio) e budget di dettagli per run, così i rilanci riprendono.
async function runDiscogsStage(cp) {
  console.log('\n════════════════════════════════════════════════════════════')
  console.log('  DISCOGS — uscite indipendenti/locali per le aree sotto soglia')
  console.log('════════════════════════════════════════════════════════════')
  if (!DISCOGS_TOKEN) { console.warn('  DISCOGS_TOKEN mancante in .env.local — salto lo stage Discogs'); return }

  cp.discogsDone       = cp.discogsDone       || {}
  cp.discogsNewArtists = cp.discogsNewArtists || 0
  cp.discogsNewTracks  = cp.discogsNewTracks  || 0

  const existing  = await loadExistingArtists()
  const trackKeys = await loadExistingTrackKeys()
  const areaEntries = Object.entries(REGIONS)
    .filter(([k, v]) => k !== '_comment' && v && Array.isArray(v.musicbrainz_countries))

  let detailsBudget = DG_DETAILS_PER_RUN
  for (const [area, region] of areaEntries) {
    const playable = await areaPlayableCount(area)
    if (playable >= DG_THRESHOLD) {
      console.log(`  ${area.padEnd(20)} ${String(playable).padStart(4)} riproducibili ≥ ${DG_THRESHOLD} — salto`)
      continue
    }
    console.log(`\n  ▸ ${area} (${playable} riproducibili < ${DG_THRESHOLD})`)

    for (const country of region.musicbrainz_countries) {
      for (let decade = 1950; decade <= 2020; decade += 10) {
        if (detailsBudget <= 0) {
          console.log('  Budget dettagli release esaurito per questo run — rilancia per continuare.')
          console.log(`\n  Discogs: +${cp.discogsNewArtists} artisti, +${cp.discogsNewTracks} brani (totale cumulato)`)
          return
        }
        const key = `${area}::${country}::${decade}`
        if (cp.discogsDone[key]) continue

        let res
        try { res = await collectDiscogsTracks(country, decade, Math.min(DG_RELEASES_PER_CD, detailsBudget)) }
        catch (err) { console.warn(`  ${country} ${decade}s failed: ${err.message}`); continue }
        detailsBudget -= res.details

        let addedA = 0
        for (const a of res.artists.values()) {
          const dgId    = `dg:${a.id}`
          const nameKey = `${a.name.toLowerCase()}::${country.toLowerCase()}`
          if (existing.mbids.has(dgId) || existing.nameCountry.has(nameKey)) continue
          await upsertArtist({
            mb_artist_id: dgId, name: a.name, country, macro_area: area,
            bio_short: null, relevance: dgRelevance(a.count),
          })
          existing.mbids.add(dgId)
          existing.nameCountry.add(nameKey)
          addedA++; cp.discogsNewArtists++
        }

        let addedT = 0
        for (const t of res.tracks) {
          const ck = trackContentKey(t.title, t.artistName, t.year)
          if (trackKeys.has(ck)) continue       // dedup stretto titolo+artista+anno
          trackKeys.add(ck)

          const dgArtistId = `dg:${t.artistId}`
          const artRel = res.artists.get(t.artistId)?.count || 1

          const itunesData = await itunesSearch(t.artistName, t.title)
          const isrc = itunesData?.isrc || null
          const appleId = isrc ? await appleSearch(isrc) : null

          await upsertTrack({
            mb_recording_id:    `dg:${t.releaseId}:${t.position}`,
            title:              t.title,
            artist_name:        t.artistName,
            // FK valida solo se l'artista dg: è stato inserito; altrimenti null
            // (l'artista esisteva già sotto altro id: il brano resta attribuito per nome).
            artist_mb_id:       existing.mbids.has(dgArtistId) ? dgArtistId : null,
            country, macro_area: area, year: t.year,
            apple_music_id:     appleId,
            itunes_track_id:    itunesData?.itunes_track_id || null,
            itunes_preview_url: itunesData?.itunes_preview_url || null,
            artwork_url:        itunesData?.artwork_url || null,
            isrc,
            tags:               t.tags,
            weight:             weightFromRelevance(dgRelevance(artRel)),
            quality_score:      qualityScore({ relevance: dgRelevance(artRel), hasApple: !!appleId }),
          })
          addedT++; cp.discogsNewTracks++
        }

        cp.discogsDone[key] = { releases: res.releases, details: res.details, addedA, addedT }
        saveCheckpoint(cp)
        if (addedA || addedT) console.log(`    ${country} ${decade}s: +${addedA} artisti, +${addedT} brani  (budget dettagli ${detailsBudget})`)
      }
    }
  }
  console.log(`\n  Discogs: +${cp.discogsNewArtists} artisti, +${cp.discogsNewTracks} brani (totale cumulato)`)
}

// ── Discogs dry-run test (nessuna scrittura) ─────────────────────────────────
// Per ogni (paese, decennio): cerca le release, ne estrae i brani (fino al cap)
// e riporta quante release/brani/artisti emergono, e quanti artisti NON compaiono
// nella ricerca per area di MusicBrainz (proxy del valore aggiunto, come il test
// Wikidata). Funziona senza Supabase: i conteggi sono potenziali (il dedup contro
// il catalogo reale avviene in scrittura).

const DG_TEST_MAX_DETAILS = 20

async function runDiscogsTest(specs) {
  console.log('JamNet — Discogs test (dry run, nessuna scrittura)\n')
  if (!DISCOGS_TOKEN) { console.error('  DISCOGS_TOKEN mancante in .env.local'); return }

  for (const { country, decade } of specs) {
    const area = Object.keys(REGIONS).find(
      k => k !== '_comment' && REGIONS[k].musicbrainz_countries?.includes(country)
    ) || '—'

    let res
    try { res = await collectDiscogsTracks(country, decade, DG_TEST_MAX_DETAILS) }
    catch (err) { console.log(`\n── ${country} ${decade}s: errore ${err.message}`); continue }

    // Confronto con la MB area-search (stesso paese): proxy del valore aggiunto.
    let mbNames = new Set()
    try {
      const p0 = await fetchArtistsForCountry(country, 0)
      const p1 = p0.length === 100 ? await fetchArtistsForCountry(country, 100) : []
      mbNames = new Set([...p0, ...p1].map(a => normKey(a.name)))
    } catch { /* confronto best-effort */ }
    const novel = [...res.artists.values()].filter(a => !mbNames.has(normKey(a.name)))

    console.log(`\n── ${country} ${decade}s  (${area}) ──`)
    console.log(`   release Discogs trovate (anni del decennio):  ${res.releases}`)
    console.log(`   dettagli release scaricati (cap ${DG_TEST_MAX_DETAILS}):          ${res.details}`)
    console.log(`   brani estratti:                               ${res.tracks.length}`)
    console.log(`   artisti distinti:                             ${res.artists.size}`)
    console.log(`   MB area-search (top ~200):                    ${mbNames.size} nomi`)
    console.log(`   artisti NON nella MB area-search:             ${novel.length}  ← valore aggiunto`)
    if (novel.length) {
      console.log('   esempi artisti nuovi:')
      for (const a of novel.slice(0, 8)) console.log(`     · ${a.name.slice(0, 40).padEnd(40)} (~${a.count} brani nel campione)`)
    }
    if (res.tracks.length) {
      console.log('   esempi brani:')
      for (const t of res.tracks.slice(0, 8)) console.log(`     · ${(t.artistName + ' — ' + t.title).slice(0, 60)}  [${t.year || '?'}]`)
    }
  }
  console.log('\nFatto (dry run). I conteggi sono potenziali: in scrittura si applica il dedup stretto titolo+artista+anno.')
}

// ── Smithsonian Folkways (Open Access API) — scoperta esecutori di tradizione ──
// Fonte di SCOPERTA artisti per paese (NON di tracce né di audio). La Smithsonian
// Open Access API (api.si.edu, chiave api.data.gov) espone il catalogo Folkways e
// gli archivi Ralph Rinzler sotto unit_code CFCHFOLKLIFE: metadati a livello di
// album, senza link audio e per lo più ad accesso ristretto. Per questo Folkways
// NON offre un fallback audio diretto (come itunes_preview_url): gli esecutori
// scoperti vanno verificati a valle su YouTube/iTunes, come per ogni altra fonte.
//
// Modello (uguale a Wikidata/Discogs):
//  - estrae i NOMI degli esecutori dai record (ruoli "performer"/"artist"; scarta
//    recorder, field worker, producer, liner notes — etnomusicologi/staff, non
//    l'entità musicale). I field recording "senza esecutore" restano fuori: serviranno
//    al catalogo streaming commerciale (integrazione futura, stile MusicKit).
//  - risolve il nome su MusicBrainz: se trovato (match esatto, normalizzato) usa
//    l'MBID reale e carica le sue registrazioni col pipeline condiviso (tracce
//    verificate su YouTube/iTunes, dedup automatico per mb_recording_id); altrimenti
//    l'artista resta "solo Folkways" con id sintetico fw:<slug>, nessuna traccia.
//  - anti-duplicati: dedup per mb_artist_id e per nome+paese (loadExistingArtists),
//    stesso principio di Wikidata/Discogs.

const SI_ENDPOINT       = 'https://api.si.edu/openaccess/api/v1.0/search'
const SI_DELAY_MS       = 500
const FW_UNIT           = 'CFCHFOLKLIFE'
const FW_ROWS_PER_PAGE  = 100
const FW_MAX_RECORDS    = 200   // record scansionati per paese per run
// Base modesta per artisti solo-Folkways: archivio curato ma senza un segnale di
// notorietà proprio; Last.fm la modula a valle. Scala comparabile a wd/dgRelevance.
const FW_RELEVANCE_BASE = 30
const FW_PERFORMER_ROLES = new Set(['performer', 'artist'])
let lastSiCall = 0

async function siFetch(q, start) {
  if (!FOLKWAYS_KEY) return null
  const wait = SI_DELAY_MS - (Date.now() - lastSiCall)
  if (wait > 0) await sleep(wait)
  lastSiCall = Date.now()
  const url = `${SI_ENDPOINT}?q=${encodeURIComponent(q)}&start=${start}&rows=${FW_ROWS_PER_PAGE}&api_key=${FOLKWAYS_KEY}`
  const res = await withRetry('siFetch', () => fetch(url, {
    headers: { 'User-Agent': 'JamNet/1.0 (edoardoguerra88@gmail.com)' },
  }))
  if (res.status === 429) {
    console.warn('  Smithsonian 429 (rate limit) — wait 30 s')
    await sleep(30000)
    return siFetch(q, start)
  }
  if (!res.ok) return null
  const data = await res.json()
  return data?.response || null
}

// "Cognome, Nome 1910-1986" / "Suso, Nyama, d. 1991" → "Nyama Suso".
// Toglie le date di vita in coda e riordina i nomi di persona (una sola virgola).
function cleanFolkwaysName(raw) {
  let s = (raw || '').trim()
  if (!s) return null
  // date di vita in coda: "1910-1986", ", d. 1991", ", b. 1940", "fl. 1950"
  s = s.replace(/,?\s*\b(d\.|b\.|fl\.|c\.|ca\.)?\s*\d{3,4}\s*[-–—]\s*\d{0,4}\.?\s*$/i, '').trim()
  s = s.replace(/,?\s*\b(d\.|b\.|fl\.)\s*\d{3,4}\.?\s*$/i, '').trim()
  s = s.replace(/,\s*$/, '').trim()
  // riordina "Cognome, Nome" → "Nome Cognome" solo se sembrano nomi propri
  const parts = s.split(',')
  if (parts.length === 2) {
    const last = parts[0].trim(), first = parts[1].trim()
    if (last && first && !/\d/.test(first) && first.split(/\s+/).length <= 3) s = `${first} ${last}`
  }
  return s.replace(/\s+/g, ' ').trim() || null
}

// Confronto di paese tollerante: minuscolo/senza diacritici, ignora "the " iniziale
// e il suffisso " of america" (Folkways usa "United States of America", MB "United
// States"). Match esatto sui token, così "Mali" ≠ "Somalia".
function sameCountry(a, b) {
  const n = s => normKey(s).replace(/^the /, '').replace(/ of america$/, '').trim()
  const na = n(a), nb = n(b)
  return !!na && na === nb
}

// Paesi citati da un record: geoLocation L2 (strutturato) + place (freetext/indicizzato).
function recordCountries(ct) {
  const out = []
  for (const g of (ct.indexedStructured?.geoLocation || [])) {
    if (g?.L2?.content) out.push(g.L2.content)
  }
  for (const p of (ct.freetext?.place || [])) { if (p?.content) out.push(p.content) }
  for (const p of (ct.indexedStructured?.place || [])) { if (typeof p === 'string') out.push(p) }
  return out
}

// Esecutori distinti (nome pulito) dai record Folkways di un paese. Per precisione,
// considera solo i record la cui geografia (geoLocation/place) corrisponde davvero
// al paese cercato: la ricerca full-text di SI pesca anche record che citano il
// paese altrove (es. un brano croato in una ricerca "Mali"). Il paese attribuito è
// sempre quello cercato, così macro_area resta coerente.
function extractFolkwaysPerformers(rows, countryName) {
  const performers = new Map()   // normKey(name) → { name, country }
  for (const r of rows || []) {
    const ct = r.content || {}
    if (!recordCountries(ct).some(c => sameCountry(c, countryName))) continue
    for (const n of (ct.freetext?.name || [])) {
      if (!FW_PERFORMER_ROLES.has((n.label || '').toLowerCase())) continue
      const name = cleanFolkwaysName(n.content)
      if (!name || name.length < 2) continue
      const key = normKey(name)
      if (key && !performers.has(key)) performers.set(key, { name, country: countryName })
    }
  }
  return [...performers.values()]
}

// Record Folkways per paese (paginati, fino a FW_MAX_RECORDS). Frase di paese fra
// virgolette così "United States of America" resta un termine unico.
async function fetchFolkwaysRecords(countryName) {
  const q = `unit_code:${FW_UNIT} AND "${countryName}"`
  const rows = []
  for (let start = 0; start < FW_MAX_RECORDS; start += FW_ROWS_PER_PAGE) {
    const resp = await siFetch(q, start)
    const batch = resp?.rows || []
    rows.push(...batch)
    if (batch.length < FW_ROWS_PER_PAGE) break
  }
  return rows
}

// Cerca un artista su MusicBrainz per nome; ritorna { id, relevance } solo per un
// match affidabile (nome uguale, normalizzato con normKey). Niente match → null
// (l'esecutore resta "solo Folkways").
async function mbArtistByName(name) {
  const data = await mbFetch(`/artist?query=${encodeURIComponent(`artist:"${name}"`)}&limit=5&fmt=json`)
  const target = normKey(name)
  for (const a of (data?.artists || [])) {
    if (normKey(a.name) === target) return { id: a.id, relevance: calcRelevance(a) }
  }
  return null
}

// Stage Folkways: per ogni paese, scopre gli esecutori, li deduplica contro il
// catalogo (mb_artist_id + nome+paese), li risolve su MusicBrainz quando possibile
// (→ tracce verificabili) e inserisce i nuovi. Checkpoint per (area, paese).
async function runFolkwaysStage(cp) {
  console.log('\n════════════════════════════════════════════════════════════')
  console.log('  SMITHSONIAN FOLKWAYS — scoperta esecutori di tradizione per paese')
  console.log('════════════════════════════════════════════════════════════')
  if (!FOLKWAYS_KEY) { console.warn('  FOLKWAYS_API_KEY mancante in .env.local — salto lo stage Folkways'); return }

  cp.folkwaysDone     = cp.folkwaysDone     || {}
  cp.folkwaysNew      = cp.folkwaysNew      || 0
  cp.folkwaysLinked   = cp.folkwaysLinked   || 0
  cp.folkwaysFwOnly   = cp.folkwaysFwOnly   || 0

  const existing = await loadExistingArtists()
  const areaEntries = Object.entries(REGIONS)
    .filter(([k, v]) => k !== '_comment' && v && Array.isArray(v.musicbrainz_countries))

  for (const [area, region] of areaEntries) {
    for (const countryName of region.musicbrainz_countries) {
      const key = `${area}::${countryName}`
      if (cp.folkwaysDone[key]) continue

      let performers = []
      try {
        const rows = await fetchFolkwaysRecords(countryName)
        performers = extractFolkwaysPerformers(rows, countryName)
      } catch (err) {
        console.warn(`  Folkways ${countryName} failed: ${err.message}`)
        continue
      }

      let added = 0, linked = 0, fwOnly = 0
      for (const p of performers) {
        const nameKey = `${p.name.toLowerCase()}::${(p.country || '').toLowerCase()}`
        if (existing.nameCountry.has(nameKey)) continue

        let mb = null
        try { mb = await mbArtistByName(p.name) } catch { /* best-effort */ }
        if (mb && existing.mbids.has(mb.id)) { existing.nameCountry.add(nameKey); continue }

        const artistId  = mb?.id || `fw:${p.name.toLowerCase().replace(/\s+/g, '-')}`
        if (existing.mbids.has(artistId)) continue
        const relevance = mb ? mb.relevance : FW_RELEVANCE_BASE

        await upsertArtist({
          mb_artist_id: artistId,
          name:         p.name,
          country:      p.country,
          macro_area:   area,
          bio_short:    null,
          relevance,
        })
        existing.mbids.add(artistId)
        existing.nameCountry.add(nameKey)

        if (mb) {
          await processRecordings({ name: p.name, mbId: mb.id, country: p.country, area, relevance }, cp)
          linked++; cp.folkwaysLinked++
        } else {
          fwOnly++; cp.folkwaysFwOnly++
        }
        added++; cp.folkwaysNew++
      }

      cp.folkwaysDone[key] = { performers: performers.length, added, linked, fwOnly }
      saveCheckpoint(cp)
      if (performers.length) {
        console.log(`  ${countryName.slice(0, 24).padEnd(24)} (${area}): ${String(performers.length).padStart(3)} performer → ${added} new (${linked} MB-linked, ${fwOnly} Folkways-only)`)
      }
    }
  }
  console.log(`\n  Folkways totale: ${cp.folkwaysNew} artisti nuovi (${cp.folkwaysLinked} MB-linked, ${cp.folkwaysFwOnly} solo Folkways)`)
}

// ── Folkways dry-run test (nessuna scrittura) ────────────────────────────────
// Per ogni paese: scansiona i record Folkways, estrae gli esecutori distinti e ne
// risolve un campione su MusicBrainz (proxy delle tracce ottenibili). Nessuna
// scrittura. Richiede FOLKWAYS_API_KEY (in .env.local o come variabile d'ambiente).

const FW_TEST_RESOLVE = 20

async function runFolkwaysTest(countryNames) {
  console.log('JamNet — Smithsonian Folkways test (dry run, nessuna scrittura)\n')
  if (!FOLKWAYS_KEY) { console.error('  FOLKWAYS_API_KEY mancante (in .env.local o variabile d\'ambiente)'); return }

  for (const countryName of countryNames) {
    const area = Object.keys(REGIONS).find(
      k => k !== '_comment' && REGIONS[k].musicbrainz_countries?.includes(countryName)
    ) || '—'

    let rows = []
    try { rows = await fetchFolkwaysRecords(countryName) }
    catch (err) { console.log(`\n── ${countryName}: errore ${err.message}`); continue }
    const performers = extractFolkwaysPerformers(rows, countryName)

    const sample = performers.slice(0, FW_TEST_RESOLVE)
    let linked = 0
    const marks = []
    for (const p of sample) {
      let mb = null
      try { mb = await mbArtistByName(p.name) } catch { /* ignore */ }
      if (mb) linked++
      marks.push({ name: p.name, mb: !!mb })
    }

    console.log(`\n── ${countryName}  (${area}) ──`)
    console.log(`   record Folkways scansionati:                  ${rows.length}`)
    console.log(`   esecutori distinti (performer/artist):        ${performers.length}`)
    console.log(`   risolti su MusicBrainz (campione ${String(sample.length).padStart(2)}):         ${linked} → tracce verificabili; gli altri restano solo-Folkways`)
    if (marks.length) {
      console.log('   esempi:')
      for (const m of marks.slice(0, 12)) console.log(`     ${m.mb ? '[MB]     ' : '[FW-only]'} ${m.name.slice(0, 46)}`)
    }
  }
  console.log('\nFatto (dry run). In scrittura: dedup per mb_artist_id e nome+paese; le tracce MB-linked dedupano per mb_recording_id.')
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

// ── Process one artist's MB recordings → tracks ──────────────────────────────
// Condiviso tra lo stage MusicBrainz e lo stage Wikidata (per artisti con MBID).

async function processRecordings({ name, mbId, country, area, relevance }, cp) {
  const recordings = await fetchRecordingsForArtist(mbId)
  let tracksAdded = 0
  for (const rec of recordings) {
    if (!rec.id || !rec.title) continue
    if (MB_UNKNOWN_RE.test(rec.title)) continue
    if (JUNK_RE.test(rec.title)) continue

    const year = getFirstYear(rec)
    const tags = getTags(rec)

    const itunesData = await itunesSearch(name, rec.title)
    const isrc = itunesData?.isrc || getMbIsrc(rec) || null
    const appleId = isrc ? await appleSearch(isrc) : null

    try {
      await upsertTrack({
        mb_recording_id:    rec.id,
        title:              rec.title,
        artist_name:        name,
        artist_mb_id:       mbId,
        country,
        macro_area:         area,
        year,
        apple_music_id:     appleId,
        itunes_track_id:    itunesData?.itunes_track_id || null,
        itunes_preview_url: itunesData?.itunes_preview_url || null,
        artwork_url:        itunesData?.artwork_url || null,
        isrc,
        tags,
        weight: weightFromRelevance(relevance),
        quality_score: qualityScore({ relevance, hasApple: !!appleId }),
      })
      tracksAdded++
    } catch (err) {
      console.error(`\n  Skipping track "${rec.title}": ${err.message}`)
    }
  }
  return tracksAdded
}

// ── Apple Music matching stage ──────────────────────────────────────────────
// Post-processing: trova tutte le tracce con ISRC ma senza apple_music_id e le matcha.
// Rilanciabile: salta le tracce già matchate. Flag: --apple-only, --skip-apple.

async function runAppleMusicStage(cp) {
  console.log('\n════════════════════════════════════════════════════════════')
  console.log('  APPLE MUSIC MATCHING — ISRC → apple_music_id')
  console.log('════════════════════════════════════════════════════════════')
  if (!APPLE_TOKEN) {
    console.log('  APPLE_MUSIC_DEVELOPER_TOKEN mancante in .env.local — skip')
    return
  }
  cp.appleMatched = cp.appleMatched || 0
  cp.appleDone    = cp.appleDone    || 0

  const PAGE = 200
  let offset = 0
  for (;;) {
    const { data, error } = await sb.from('tracks')
      .select('id, isrc')
      .not('isrc', 'is', null)
      .is('apple_music_id', null)
      .range(offset, offset + PAGE - 1)
    if (error) { console.warn('  Apple query error:', error.message); break }
    if (!data?.length) break

    for (const t of data) {
      try {
        const appleId = await appleSearch(t.isrc)
        if (appleId) {
          await withRetry('appleUpdate', () =>
            sb.from('tracks').update({ apple_music_id: appleId }).eq('id', t.id)
          )
          cp.appleMatched++
        }
      } catch (err) {
        console.warn(`  Apple match error for isrc ${t.isrc}: ${err.message}`)
      }
      cp.appleDone++
    }
    saveCheckpoint(cp)
    process.stdout.write(`\r  Processed ${cp.appleDone} (matched ${cp.appleMatched})`)

    if (data.length < PAGE) break
    offset += PAGE
  }
  console.log(`\n  Apple Music: ${cp.appleMatched}/${cp.appleDone} tracce matchate`)
}

// ── Artwork backfill stage ──────────────────────────────────────────────────
// Recupera artwork_url per tutte le tracce con apple_music_id ma senza artwork.
// Usa l'endpoint batch Apple Music (300 id per chiamata). Flag: --artwork-only.

async function runArtworkStage() {
  console.log('\n════════════════════════════════════════════════════════════')
  console.log('  ARTWORK BACKFILL — apple_music_id → artwork_url')
  console.log('════════════════════════════════════════════════════════════')
  if (!APPLE_TOKEN) {
    console.log('  APPLE_MUSIC_DEVELOPER_TOKEN mancante — skip')
    return
  }

  const BATCH = 300
  const DELAY = 250
  let total = 0, updated = 0, noArtwork = 0

  // Non usa offset crescente: le tracce aggiornate escono dal result set da sole,
  // quindi si fa sempre .range(0, BATCH-1). Il loop finisce quando non ce ne sono più.
  // Per evitare loop infiniti su tracce che Apple non restituisce artwork,
  // si raccolgono gli id senza risultato e si skippano nelle iterazioni successive.
  const skipIds = new Set()

  for (;;) {
    let query = sb.from('tracks')
      .select('id, apple_music_id')
      .not('apple_music_id', 'is', null)
      .is('artwork_url', null)
    if (skipIds.size > 0) {
      query = query.not('apple_music_id', 'in', `(${[...skipIds].join(',')})`)
    }
    const { data, error } = await query.range(0, BATCH - 1)
    if (error) { console.warn('  query error:', error.message); break }
    if (!data?.length) break

    total += data.length
    const ids = data.map(t => t.apple_music_id).join(',')
    const url = `https://api.music.apple.com/v1/catalog/it/songs?ids=${encodeURIComponent(ids)}&fields[songs]=artwork`

    try {
      const wait = DELAY - (Date.now() - lastAppleCall)
      if (wait > 0) await sleep(wait)
      lastAppleCall = Date.now()

      const res = await fetch(url, { headers: { Authorization: `Bearer ${APPLE_TOKEN}` } })
      if (!res.ok) { console.warn('  Apple API error:', res.status); break }
      const json = await res.json()

      const artworkById = {}
      for (const item of (json.data || [])) {
        const raw = item.attributes?.artwork?.url
        if (raw) artworkById[item.id] = raw.replace('{w}x{h}', '600x600')
      }

      for (const t of data) {
        const art = artworkById[t.apple_music_id]
        if (!art) { skipIds.add(t.apple_music_id); noArtwork++; continue }
        await withRetry('artworkUpdate', () =>
          sb.from('tracks').update({ artwork_url: art }).eq('id', t.id)
        )
        updated++
      }
    } catch (err) {
      console.warn('  batch error:', err.message)
      // In caso di errore di rete, aggiungi tutti gli id al skip per non bloccare
      for (const t of data) skipIds.add(t.apple_music_id)
    }

    process.stdout.write(`\r  Processed ${total} — updated ${updated} — no artwork ${noArtwork}`)
  }
  console.log(`\n  Artwork backfill: ${updated}/${total} tracce aggiornate`)
}

// ── Wikidata stage ───────────────────────────────────────────────────────────

// Carica gli artisti già in catalogo per la deduplica: per mb_artist_id e per
// nome+paese (minuscolo). Paginato per superare il limite di 1000 righe di PostgREST.
async function loadExistingArtists() {
  const mbids = new Set()
  const nameCountry = new Set()
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb.from('artists')
      .select('mb_artist_id, name, country')
      .range(from, from + PAGE - 1)
    if (error || !data?.length) break
    for (const a of data) {
      if (a.mb_artist_id) mbids.add(a.mb_artist_id)
      nameCountry.add(`${(a.name || '').toLowerCase()}::${(a.country || '').toLowerCase()}`)
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return { mbids, nameCountry }
}

// Per ogni paese (codice ISO in regions.json): interroga Wikidata, deduplica
// contro il catalogo, inserisce gli artisti nuovi.
//  - con MusicBrainz ID (P434): mb_artist_id = MBID reale → si collega alle righe MB
//    e ne carica anche le registrazioni (tracce) tramite il pipeline condiviso.
//  - senza MBID ("solo Wikidata"): mb_artist_id sintetico "wd:<QID>" — coerente con
//    lo schema (la PK resta text non-null) e marca la provenienza. Nessuna traccia MB.
async function runWikidataStage(cp) {
  console.log('\n════════════════════════════════════════════════════════════')
  console.log('  WIKIDATA — artisti complementari per paese')
  console.log('════════════════════════════════════════════════════════════')

  cp.wikidataDone = cp.wikidataDone || {}
  cp.wikidataNewArtists = cp.wikidataNewArtists || 0
  cp.wikidataNewWdOnly  = cp.wikidataNewWdOnly  || 0

  const existing = await loadExistingArtists()
  const areaEntries = Object.entries(REGIONS)
    .filter(([k, v]) => k !== '_comment' && v && Array.isArray(v.countries))

  for (const [area, { countries }] of areaEntries) {
    for (const iso of countries) {
      const key = `${area}::${iso}`
      if (cp.wikidataDone[key]) continue

      let found = []
      try {
        found = await fetchArtistsFromWikidata(iso)
      } catch (err) {
        console.warn(`  Wikidata ${iso} failed: ${err.message}`)
        continue
      }

      let added = 0, linked = 0, wdOnly = 0
      for (const a of found) {
        const nameKey = `${a.name.toLowerCase()}::${(a.countryLabel || '').toLowerCase()}`
        if (a.mbid && existing.mbids.has(a.mbid)) continue
        if (existing.nameCountry.has(nameKey)) continue

        const artistId = a.mbid || `wd:${a.qid}`
        if (existing.mbids.has(artistId)) continue

        const bio = a.enwiki ? await fetchWikiBio(a.enwiki) : null
        await upsertArtist({
          mb_artist_id: artistId,
          name:         a.name,
          country:      a.countryLabel,
          macro_area:   area,
          bio_short:    bio,
          relevance:    wdRelevance(a.sitelinks),
        })
        existing.mbids.add(artistId)
        existing.nameCountry.add(nameKey)

        // Artisti collegati a MusicBrainz: carica anche le loro registrazioni.
        if (a.mbid) {
          await processRecordings({
            name: a.name, mbId: a.mbid, country: a.countryLabel, area,
            relevance: wdRelevance(a.sitelinks),
          }, cp)
          linked++
        } else {
          wdOnly++
        }
        added++
        cp.wikidataNewArtists++
        if (!a.mbid) cp.wikidataNewWdOnly++
      }

      cp.wikidataDone[key] = { found: found.length, added, linked, wdOnly }
      saveCheckpoint(cp)
      console.log(`  ${iso} (${area}): ${String(found.length).padStart(3)} found → ${added} new (${linked} MB-linked, ${wdOnly} Wikidata-only)`)
    }
  }
  console.log(`\n  Wikidata totale: ${cp.wikidataNewArtists} artisti nuovi (${cp.wikidataNewWdOnly} solo Wikidata)`)
}

// ── Wikidata dry-run test (nessuna scrittura) ────────────────────────────────
// Riporta, per ogni paese: artisti trovati su Wikidata, quanti collegati a MB,
// quanti "solo Wikidata", e quanti NON compaiono nella ricerca per area di MB
// (= valore aggiunto netto della fonte). Funziona senza .env.local.
async function runWikidataTest(isoList) {
  console.log('JamNet — Wikidata test (dry run, nessuna scrittura)\n')
  for (const iso of isoList) {
    const area = Object.keys(REGIONS).find(
      k => k !== '_comment' && REGIONS[k].countries?.includes(iso)
    ) || '—'

    const found = await fetchArtistsFromWikidata(iso)
    const linked = found.filter(a => a.mbid)
    const wdOnly = found.filter(a => !a.mbid)

    // Confronto con la ricerca per area di MusicBrainz (stesso nome paese di Wikidata).
    const countryLabel = found[0]?.countryLabel || iso
    let mbNames = new Set()
    try {
      const p0 = await fetchArtistsForCountry(countryLabel, 0)
      const p1 = p0.length === 100 ? await fetchArtistsForCountry(countryLabel, 100) : []
      mbNames = new Set([...p0, ...p1].map(a => (a.name || '').toLowerCase()))
    } catch { /* ignora: confronto best-effort */ }

    const novelToMb = found.filter(a => !mbNames.has(a.name.toLowerCase()))

    console.log(`\n── ${iso}  (${area})  paese Wikidata: ${countryLabel} ──`)
    console.log(`   artisti su Wikidata:        ${found.length}`)
    console.log(`   con MusicBrainz ID (P434):  ${linked.length}`)
    console.log(`   solo Wikidata (no MBID):    ${wdOnly.length}`)
    console.log(`   MB area-search (top ~200):  ${mbNames.size} nomi`)
    console.log(`   NON nella MB area-search:   ${novelToMb.length}  ← candidati nuovi`)
    console.log('   top per sitelink:')
    for (const a of found.slice(0, 8)) {
      const tag = a.mbid ? '[MB]' : '[WD-only]'
      console.log(`     ${String(a.sitelinks).padStart(3)}  ${a.name.slice(0, 32).padEnd(32)} ${tag}`)
    }
    if (novelToMb.length) {
      console.log('   esempi non trovati dalla MB area-search:')
      for (const a of novelToMb.slice(0, 6)) {
        const tag = a.mbid ? '[MB-linked]' : '[WD-only]'
        console.log(`     · ${a.name.slice(0, 36).padEnd(36)} sitelinks=${String(a.sitelinks).padStart(3)} ${tag}`)
      }
    }
  }
  console.log('\nFatto (dry run).')
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
      .eq('macro_area', area).not('apple_music_id', 'is', null)
    console.log(`  ${area.padEnd(20)} ${String(playable || 0).padStart(4)} playable / ${String(total || 0).padStart(5)} total`)
  }
  console.log('\n  By decade:')
  for (let d = 1950; d <= 2020; d += 10) {
    const { count } = await sb.from('tracks').select('*', { count: 'exact', head: true })
      .gte('year', d).lt('year', d + 10).not('apple_music_id', 'is', null)
    console.log(`    ${d}s: ${count || 0} playable tracks`)
  }

  // Provenienza artisti per prefisso dell'id sintetico (wd:/sp:/lf:/dg:) vs MusicBrainz.
  console.log('\n  Artists by source:')
  const { count: artistsTotal } = await sb.from('artists').select('*', { count: 'exact', head: true })
  const { count: wdOnly } = await sb.from('artists').select('*', { count: 'exact', head: true }).like('mb_artist_id', 'wd:%')
  const { count: spOnly } = await sb.from('artists').select('*', { count: 'exact', head: true }).like('mb_artist_id', 'sp:%')
  const { count: lfOnly } = await sb.from('artists').select('*', { count: 'exact', head: true }).like('mb_artist_id', 'lf:%')
  const { count: dgOnly } = await sb.from('artists').select('*', { count: 'exact', head: true }).like('mb_artist_id', 'dg:%')
  const synthetic = (wdOnly || 0) + (spOnly || 0) + (lfOnly || 0) + (dgOnly || 0)
  console.log(`    total: ${artistsTotal || 0}   ·   MusicBrainz-linked: ${(artistsTotal || 0) - synthetic}`)
  console.log(`    Wikidata-only: ${wdOnly || 0}   ·   Spotify-only: ${spOnly || 0}   ·   Last.fm-only: ${lfOnly || 0}   ·   Discogs-only: ${dgOnly || 0}`)
  for (const area of areaNames) {
    const { count: aDg } = await sb.from('artists').select('*', { count: 'exact', head: true })
      .eq('macro_area', area).like('mb_artist_id', 'dg:%')
    if (aDg) console.log(`      ${area.padEnd(20)} +${aDg} Discogs-only`)
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

// ── Interest score (Fase 2) ──────────────────────────────────────────────────
// Punteggio di "interesse" GLOBALE precalcolato, consumato da /api/discover
// (lib/discovery preferisce questo quando ogni riga del pool lo possiede):
//   interest = wQuality·Q + wGem·G + wDistinct·D    (ogni componente 0..1)
//   • Q  qualità/popolarità: quality_score normalizzato (denom fisso, stabile fra run)
//   • G  gem: la traccia "buca" rispetto al suo artista (track_listeners vs listeners artista)
//   • D  distintività: rarità dei tag DENTRO la macro-area (IDF globale, non pool-local)
// I pesi rispecchiano DISCOVERY_CONFIG in lib/discovery.ts — tenerli allineati.
const INTEREST_W = { quality: 0.55, gem: 0.20, distinct: 0.25 }
const INTEREST_Q_DENOM = 140   // ~ tetto pratico di quality_score (recog 120 + apple 8 + bonus)

function clamp01(x) { return Math.max(0, Math.min(1, x)) }

async function loadAllTracksForInterest() {
  const out = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb.from('tracks')
      .select('id, macro_area, tags, quality_score, track_listeners, artist_mb_id')
      .range(from, from + PAGE - 1)
    if (error) { console.warn('  loadTracks:', error.message); break }
    if (!data?.length) break
    out.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

async function loadArtistListeners() {
  const map = new Map()
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb.from('artists')
      .select('mb_artist_id, listeners')
      .range(from, from + PAGE - 1)
    if (error || !data?.length) break
    for (const a of data) map.set(a.mb_artist_id, Number(a.listeners) || 0)
    if (data.length < PAGE) break
    from += PAGE
  }
  return map
}

async function runInterestStage() {
  console.log('\n──── Interest score (Fase 2) ────')
  const tracks = await loadAllTracksForInterest()
  if (!tracks.length) { console.log('  nessuna traccia'); return }
  const artistListeners = await loadArtistListeners()

  // Frequenza dei tag PER macro-area (distintività globale).
  const areaDf = new Map()     // area -> Map(tag -> count)
  const areaCount = new Map()  // area -> n tracce
  for (const t of tracks) {
    const area = t.macro_area || '∅'
    areaCount.set(area, (areaCount.get(area) || 0) + 1)
    let df = areaDf.get(area)
    if (!df) { df = new Map(); areaDf.set(area, df) }
    for (const tag of new Set(t.tags || [])) df.set(tag, (df.get(tag) || 0) + 1)
  }
  const idf = (area, tag) => {
    const n = areaCount.get(area) || 1
    const df = (areaDf.get(area)?.get(tag)) || 0
    return Math.log(n / (1 + df))
  }
  // Normalizzazione di D per-area: massimo IDF medio osservato nell'area.
  const areaMaxAvgIdf = new Map()
  for (const t of tracks) {
    const area = t.macro_area || '∅'
    const tags = t.tags || []
    const avg = tags.length ? tags.reduce((s, tag) => s + idf(area, tag), 0) / tags.length : 0
    if (avg > (areaMaxAvgIdf.get(area) || 0)) areaMaxAvgIdf.set(area, avg)
  }

  const interestOf = (t) => {
    const area = t.macro_area || '∅'
    const q = clamp01((Number(t.quality_score) || 0) / INTEREST_Q_DENOM)
    const tl = Number(t.track_listeners) || 0
    const al = artistListeners.get(t.artist_mb_id) || 0
    // gem: quanto la traccia "buca" rispetto alla scala del suo artista (0.5 = in linea)
    const g = tl > 0 ? clamp01(0.5 + (Math.log10(tl + 10) - Math.log10(al + 10)) / 4) : 0
    const tags = t.tags || []
    const maxIdf = Math.max(1e-6, areaMaxAvgIdf.get(area) || 0)
    const d = tags.length ? clamp01((tags.reduce((s, tag) => s + idf(area, tag), 0) / tags.length) / maxIdf) : 0
    return INTEREST_W.quality * q + INTEREST_W.gem * g + INTEREST_W.distinct * d
  }

  let done = 0
  const CHUNK = 25
  for (let i = 0; i < tracks.length; i += CHUNK) {
    const slice = tracks.slice(i, i + CHUNK)
    await Promise.all(slice.map(t => {
      const interest = Math.round(interestOf(t) * 1e6) / 1e6
      return sb.from('tracks').update({ interest_score: interest }).eq('id', t.id)
        .then(({ error }) => { if (error) console.warn('  update interest:', error.message) })
    }))
    done += slice.length
    process.stdout.write(`\r  scored ${done}/${tracks.length}`)
  }
  console.log(`\n  ✓ interest_score aggiornato per ${done} tracce su ${areaCount.size} aree`)
}

async function main() {
  console.log('JamNet build-catalog — started at', new Date().toISOString())
  const cp = loadCheckpoint()
  console.log(`  Resumed from: ${cp.lastRun || 'fresh start'}`)
  console.log(`  YouTube searches used: ${cp.ytSearchesDone}/${YT_QUOTA_PER_RUN}`)

  const areaEntries = Object.entries(REGIONS).filter(([, v]) => v && Array.isArray(v.musicbrainz_countries))

  const ONLY_OTHER = WD_ONLY || LF_ONLY || SP_ONLY || DG_ONLY || FW_ONLY || AP_ONLY || ART_ONLY
  const runMB = !ONLY_OTHER && !INTEREST_ONLY
  const runWD = !SKIP_WD && !LF_ONLY && !SP_ONLY && !DG_ONLY && !FW_ONLY && !AP_ONLY && !ART_ONLY && !INTEREST_ONLY
  const runLF = !SKIP_LF && !WD_ONLY && !SP_ONLY && !DG_ONLY && !FW_ONLY && !AP_ONLY && !ART_ONLY && !INTEREST_ONLY
  const runSP = !SKIP_SP && !WD_ONLY && !LF_ONLY && !DG_ONLY && !FW_ONLY && !AP_ONLY && !ART_ONLY && !INTEREST_ONLY
  const runDG  = !SKIP_DG && !WD_ONLY && !LF_ONLY && !SP_ONLY && !FW_ONLY && !AP_ONLY && !ART_ONLY && !INTEREST_ONLY
  const runFW  = !SKIP_FW && !WD_ONLY && !LF_ONLY && !SP_ONLY && !DG_ONLY && !AP_ONLY && !ART_ONLY && !INTEREST_ONLY
  const runAP  = !SKIP_AP && !ART_ONLY && !INTEREST_ONLY
  const runART = !INTEREST_ONLY
  // Interest score (Fase 2): per ultimo, consuma quality_score/tags/track_listeners finali.
  const runINT = INTEREST_ONLY || (!SKIP_INTEREST && !ONLY_OTHER)

  if (WD_ONLY)  console.log('\n(--wikidata-only: salto MusicBrainz, Last.fm, Spotify, Discogs, Folkways e Apple)')
  if (LF_ONLY)  console.log('\n(--lastfm-only: salto MusicBrainz, Wikidata, Spotify, Discogs, Folkways e Apple)')
  if (SP_ONLY)  console.log('\n(--spotify-only: salto MusicBrainz, Wikidata, Last.fm, Discogs, Folkways e Apple)')
  if (DG_ONLY)  console.log('\n(--discogs-only: salto MusicBrainz, Wikidata, Last.fm, Spotify, Folkways e Apple)')
  if (FW_ONLY)  console.log('\n(--folkways-only: salto MusicBrainz, Wikidata, Last.fm, Spotify, Discogs e Apple)')
  if (AP_ONLY)  console.log('\n(--apple-only: esegue solo il matching Apple Music su tracce con ISRC)')
  if (ART_ONLY) console.log('\n(--artwork-only: esegue solo il backfill artwork_url via Apple Music API)')

  for (const [area, { musicbrainz_countries: mbCountries }] of (runMB ? areaEntries : [])) {
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

            const tracksAdded = await processRecordings({
              name: artist.name, mbId, country: countryName, area, relevance,
            }, cp)
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

  // Wikidata: fonte artisti complementare (dopo MusicBrainz, non sostitutiva)
  if (runWD) await runWikidataStage(cp)

  // Folkways: scoperta di esecutori di tradizione/field recording per paese (dopo
  // Wikidata, prima di Last.fm così il segnale modula anche i nuovi artisti).
  if (runFW) await runFolkwaysStage(cp)

  // Last.fm: segnale di rilevanza/tag che modula la relevance degli artisti in catalogo.
  // Va dopo MusicBrainz/Wikidata così opera sull'intero catalogo (anche i nuovi).
  if (runLF) await runLastfmStage(cp)
  if (runLF && LF_DISCOVER) await runLastfmDiscoverStage(cp)
  if (runLF && LF_TRACKS) await runLastfmTracksStage(cp)

  // Spotify: scoperta artisti correlati a partire dai semi ad alta relevance.
  // Dopo Last.fm, così i semi sono ordinati sulla relevance già modulata.
  if (runSP) await runSpotifyStage(cp)

  // Discogs: riempimento delle aree sotto soglia con uscite indipendenti/locali
  // assenti da MusicBrainz. Per ultimo: gli altri stage hanno già popolato il
  // catalogo e definito quali aree restano sotto la soglia di sez. 3.2.
  if (runDG) await runDiscogsStage(cp)

  // Apple Music matching: post-processing su tutte le tracce con ISRC.
  // Gira per ultimo così beneficia degli ISRC aggiunti da tutti gli stage precedenti.
  if (runAP) await runAppleMusicStage(cp)

  // Artwork backfill: recupera artwork_url per le tracce con apple_music_id ma senza artwork.
  // Gira dopo il matching così copre anche i nuovi match.
  if (runART) await runArtworkStage()

  // Interest score (Fase 2): ricalcola il segnale globale dopo che tutti gli stage
  // hanno finalizzato quality_score, tag e track_listeners.
  if (runINT) await runInterestStage()

  await logSummary()
  saveCheckpoint(cp)
  console.log('\nDone.')
}

if (DG_TEST) {
  // Formato: "Paese:decennio,Paese:decennio" — es. "Mali:1970,Nigeria:1970".
  const specs = DG_TEST.split(',').map(s => {
    const i = s.lastIndexOf(':')
    if (i < 0) return null
    const country = s.slice(0, i).trim()
    const decade  = parseInt(s.slice(i + 1).trim())
    return country && decade ? { country, decade: Math.floor(decade / 10) * 10 } : null
  }).filter(Boolean)
  runDiscogsTest(specs).catch(e => { console.error(e); process.exit(1) })
} else if (FW_TEST) {
  const countryNames = FW_TEST.split(',').map(s => s.trim()).filter(Boolean)
  runFolkwaysTest(countryNames).catch(e => { console.error(e); process.exit(1) })
} else if (SP_TEST) {
  const names = (typeof SP_TEST === 'string' && SP_TEST)
    ? SP_TEST.split(',').map(s => s.trim()).filter(Boolean)
    : SP_TEST_SAMPLE
  runSpotifyTest(names).catch(e => { console.error(e); process.exit(1) })
} else if (LF_TEST) {
  const names = (typeof LF_TEST === 'string' && LF_TEST)
    ? LF_TEST.split(',').map(s => s.trim()).filter(Boolean)
    : LF_TEST_SAMPLE
  runLastfmTest(names).catch(e => { console.error(e); process.exit(1) })
} else if (WD_TEST) {
  const isoList = WD_TEST.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  runWikidataTest(isoList).catch(e => { console.error(e); process.exit(1) })
} else {
  main().catch(e => { console.error(e); process.exit(1) })
}

// Offline proof that the discovery algorithm works — no Supabase needed.
// Builds a synthetic catalog (power-law popularity, skewed tags), then runs full
// listening sessions through the REAL selection code (lib/discovery.selectBatch)
// and checks: termination, batch size, artist cooldown, long-tail reach from
// track #1, cross-session variety. Also contrasts against a naive quality^2 top-N
// baseline so the improvement is concrete. Run: npx tsx scripts/sim-discovery.mts
import { selectBatch, type DiscoveryRow } from '../lib/discovery.ts'

// ── Seeded RNG (mulberry32) for deterministic, reproducible runs ──────────────
function mulberry32(seed: number) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const AREAS = ['West Africa','North Africa','Middle East','South Asia','East Asia',
  'Southeast Asia','Latin America','Caribbean','Europe','North America','Oceania']
const COMMON_TAGS = ['folk','traditional','world','acoustic','vocal']
const AREA_TAGS: Record<string, string[]> = Object.fromEntries(
  AREAS.map((a, i) => [a, [`${a.toLowerCase().replace(/\s/g,'')}-roots`, `genre${i}a`, `genre${i}b`, `genre${i}c`, `genre${i}d`]]),
)

function buildCatalog(rng: () => number, nArtists = 600, nTracks = 6000): DiscoveryRow[] {
  // Power-law artist popularity: a few giants, a long tail of obscure names.
  const artists = Array.from({ length: nArtists }, (_, i) => {
    const area = AREAS[Math.floor(rng() * AREAS.length)]
    const pop = Math.pow(rng(), 3)            // skew toward 0 (most are obscure)
    return { id: `art-${i}`, name: `Artist ${i}`, area, country: `${area.slice(0,2)}-${i % 5}`, pop }
  })
  const tracks: DiscoveryRow[] = []
  for (let i = 0; i < nTracks; i++) {
    const a = artists[Math.floor(rng() * artists.length)]
    // quality tracks artist popularity (log-listeners shape) plus noise
    const listeners = Math.floor(Math.pow(a.pop, 1) * 4_000_000 * (0.5 + rng()))
    const quality = Math.round(Math.pow(Math.log10(listeners + 10), 1.5) * 4) + (rng() < 0.5 ? 8 : 0)
    const tagPool = [...AREA_TAGS[a.area], ...(rng() < 0.6 ? COMMON_TAGS : [])]
    const tags: string[] = []
    const nTags = 1 + Math.floor(rng() * 3)
    for (let k = 0; k < nTags; k++) tags.push(tagPool[Math.floor(rng() * tagPool.length)])
    tracks.push({
      id: `trk-${i}`,
      artist_name: a.name, artist_mb_id: a.id,
      country: a.country, macro_area: a.area,
      tags: [...new Set(tags)],
      quality_score: quality, weight: Math.max(1, Math.round(quality / 10)),
      track_listeners: rng() < 0.3 ? Math.floor(listeners * (0.3 + rng())) : null,
    })
  }
  return tracks
}

const POOL_SIZE = 300
const BATCH = 30
const SESSION_LEN = 60

// Sample a random eligible pool the way the route does (random window minus seen).
function samplePool(catalog: DiscoveryRow[], seen: Set<string>, rng: () => number): DiscoveryRow[] {
  const out: DiscoveryRow[] = []
  const n = catalog.length
  let i = Math.floor(rng() * n)
  for (let scanned = 0; scanned < n && out.length < POOL_SIZE; scanned++) {
    const r = catalog[(i + scanned) % n]
    if (!seen.has(r.id)) out.push(r)
  }
  return out
}

function runSession(catalog: DiscoveryRow[], seed: number, isWhirl: boolean) {
  const rng = mulberry32(seed)
  const seen = new Set<string>()
  const sequence: DiscoveryRow[] = []
  const sessionTags: string[][] = []
  let firstBatch: DiscoveryRow[] = []
  while (sequence.length < SESSION_LEN) {
    const pool = samplePool(catalog, seen, rng)
    if (pool.length === 0) break
    const { picked } = selectBatch(pool, {
      sessionDepth: seen.size, isWhirl, sessionTags, batchSize: BATCH, rng,
    })
    if (picked.length === 0) break
    if (sequence.length === 0) firstBatch = picked
    for (const p of picked) {
      seen.add(p.id); sequence.push(p)
      sessionTags.push(p.tags || [])
    }
  }
  return { sequence, firstBatch }
}

// Naive baseline: top-N by quality^2 weighted draw, no diversity, no strata.
function baselineSession(catalog: DiscoveryRow[], seed: number) {
  const rng = mulberry32(seed)
  const seen = new Set<string>()
  const sequence: DiscoveryRow[] = []
  while (sequence.length < SESSION_LEN) {
    const pool = samplePool(catalog, seen, rng)
    if (pool.length === 0) break
    const picks: DiscoveryRow[] = []
    const remaining = [...pool]
    while (picks.length < BATCH && remaining.length) {
      const total = remaining.reduce((s, r) => s + Math.pow(Number(r.quality_score) || 1, 2), 0)
      let x = rng() * total
      let idx = remaining.length - 1
      for (let i = 0; i < remaining.length; i++) { x -= Math.pow(Number(remaining[i].quality_score) || 1, 2); if (x <= 0) { idx = i; break } }
      picks.push(remaining.splice(idx, 1)[0])
    }
    for (const p of picks) { seen.add(p.id); sequence.push(p) }
  }
  return sequence
}

// ── Metrics ───────────────────────────────────────────────────────────────────
function qualityMedian(catalog: DiscoveryRow[]) {
  const q = catalog.map(r => Number(r.quality_score) || 0).sort((a, b) => a - b)
  return q[Math.floor(q.length / 2)]
}
function tailShare(seq: DiscoveryRow[], medianQ: number) {
  return seq.filter(r => (Number(r.quality_score) || 0) <= medianQ).length / Math.max(1, seq.length)
}
function distinctArtistRatio(seq: DiscoveryRow[]) {
  return new Set(seq.map(r => r.artist_mb_id)).size / Math.max(1, seq.length)
}
function maxArtistRunViolation(seq: DiscoveryRow[], cooldown: number) {
  // Largest number of times any artist repeats within a `cooldown` window.
  let worst = 0
  for (let i = 0; i < seq.length; i++) {
    for (let j = i + 1; j < Math.min(seq.length, i + cooldown); j++) {
      if (seq[i].artist_mb_id === seq[j].artist_mb_id) worst++
    }
  }
  return worst
}
function overlap(a: DiscoveryRow[], b: DiscoveryRow[]) {
  const sb = new Set(b.map(r => r.id))
  return a.filter(r => sb.has(r.id)).length / Math.max(1, a.length)
}

// ── Run & assert ────────────────────────────────────────────────────────────
const catalog = buildCatalog(mulberry32(1), 600, 6000)
const medianQ = qualityMedian(catalog)

// Narrow scenario: a small area/country — few prolific artists, many tracks each.
// This is where an artist cooldown earns its keep (baseline clusters; we don't).
const narrow = buildCatalog(mulberry32(7), 12, 500)
const narrowAlgo = runSession(narrow, 55, false).sequence
const narrowBase = baselineSession(narrow, 55)

const s1 = runSession(catalog, 101, false)   // Course
const s2 = runSession(catalog, 202, false)   // Course, different seed
const sw = runSession(catalog, 303, true)    // Whirl
const base = baselineSession(catalog, 101)

const checks: { name: string; pass: boolean; detail: string }[] = []
const A = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail })

A('Session terminates & fills', s1.sequence.length === SESSION_LEN, `${s1.sequence.length}/${SESSION_LEN} tracks`)
A('First batch size = 30', s1.firstBatch.length === BATCH, `${s1.firstBatch.length}`)
A('No artist-cooldown violations (within 6)', maxArtistRunViolation(s1.sequence, 6) === 0, `${maxArtistRunViolation(s1.sequence, 6)} violations`)
A('Long-tail reached in FIRST batch (≥15%)', tailShare(s1.firstBatch, medianQ) >= 0.15, `${(tailShare(s1.firstBatch, medianQ) * 100).toFixed(0)}% below-median quality`)
A('High distinct-artist ratio (≥0.85)', distinctArtistRatio(s1.sequence) >= 0.85, `${distinctArtistRatio(s1.sequence).toFixed(2)}`)
A('Two fresh sessions differ (<35% overlap)', overlap(s1.sequence, s2.sequence) < 0.35, `${(overlap(s1.sequence, s2.sequence) * 100).toFixed(0)}% overlap`)
A('Whirl opens wider than Course', tailShare(sw.sequence, medianQ) >= tailShare(s1.sequence, medianQ), `whirl ${(tailShare(sw.sequence, medianQ)*100).toFixed(0)}% vs course ${(tailShare(s1.sequence, medianQ)*100).toFixed(0)}%`)
A('Beats baseline on tail reach', tailShare(s1.sequence, medianQ) > tailShare(base, medianQ), `algo ${(tailShare(s1.sequence, medianQ)*100).toFixed(0)}% vs baseline ${(tailShare(base, medianQ)*100).toFixed(0)}%`)
A('Artist variety stays high vs baseline (within 0.1)', distinctArtistRatio(s1.sequence) >= distinctArtistRatio(base) - 0.1, `algo ${distinctArtistRatio(s1.sequence).toFixed(2)} vs baseline ${distinctArtistRatio(base).toFixed(2)}`)
{
  const algoV = maxArtistRunViolation(narrowAlgo, 6)
  const baseV = maxArtistRunViolation(narrowBase, 6)
  // Narrow pool (12 artists): perfect spacing is sometimes infeasible, so the win
  // is a large reduction in clustering, not zero.
  A('Cooldown cuts clustering ≥3x in narrow pool', baseV > 0 && algoV <= baseV / 3, `algo ${algoV} vs baseline ${baseV} clustered repeats`)
}

// Phase 2 path: when every row carries a precomputed interest_score, selectBatch
// must use it and still honour cooldown / batch size.
{
  const pre = buildCatalog(mulberry32(9), 400, 4000).map((r, i) => ({ ...r, interest_score: (i % 97) / 97 }))
  const session = (() => {
    const rng = mulberry32(44); const seen = new Set<string>(); const seq: DiscoveryRow[] = []
    while (seq.length < SESSION_LEN) {
      const pool = samplePool(pre, seen, rng)
      if (!pool.length) break
      const { picked } = selectBatch(pool, { sessionDepth: seen.size, sessionTags: [], batchSize: BATCH, rng })
      if (!picked.length) break
      for (const p of picked) { seen.add(p.id); seq.push(p) }
    }
    return seq
  })()
  A('Precomputed interest_score path works (Phase 2)', session.length === SESSION_LEN && maxArtistRunViolation(session, 6) === 0, `${session.length} tracks, ${maxArtistRunViolation(session, 6)} violations`)
}

console.log('\n  JamNet discovery — offline simulation')
console.log('  ' + '─'.repeat(60))
console.log(`  catalog: ${catalog.length} tracks, ${new Set(catalog.map(c=>c.artist_mb_id)).size} artists, median quality ${medianQ}`)
console.log('  ' + '─'.repeat(60))
let allPass = true
for (const c of checks) {
  allPass = allPass && c.pass
  console.log(`  ${c.pass ? '✓' : '✗'}  ${c.name.padEnd(42)} ${c.detail}`)
}
console.log('  ' + '─'.repeat(60))
console.log(`  ${allPass ? '✓ ALL CHECKS PASS' : '✗ SOME CHECKS FAILED'}\n`)
process.exit(allPass ? 0 : 1)

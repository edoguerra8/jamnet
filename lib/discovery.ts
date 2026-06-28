// Pure, dependency-free discovery selection — shared by the /api/discover route
// and the offline simulation (scripts/sim-discovery.mts). No Supabase, no React:
// it takes plain candidate rows and returns the chosen batch, so it can be unit-
// tested and reasoned about in isolation. Randomness is injected for determinism.

export type Rng = () => number

export interface DiscoveryRow {
  id: string
  artist_name?: string | null
  artist_mb_id?: string | null
  country?: string | null
  macro_area?: string | null
  tags?: string[] | null
  quality_score?: number | null
  weight?: number | null
  track_listeners?: number | null
  /** Phase 2: precomputed at catalog build time. When present on every row it
   *  supersedes the pool-local interest computation below. */
  interest_score?: number | null
}

// ── Tunable knobs ───────────────────────────────────────────────────────────
// Everything that shapes the "feel" of discovery lives here so it can be tuned
// in one place. interest = wQuality·Q + wGem·G + wDistinct·D (each 0..1).
export const DISCOVERY_CONFIG = {
  wQuality:  0.55,
  wGem:      0.20,
  wDistinct: 0.25,
  // Batch composition across interest strata [high, mid, long-tail]. Shifts toward
  // the long tail deeper in a session and in Whirl — range is guaranteed from #1.
  mixShallow: [0.45, 0.35, 0.20] as [number, number, number],
  mixDeep:    [0.30, 0.33, 0.37] as [number, number, number],
  // Softmax temperature within a stratum: higher = wider / more surprising.
  tempShallow: 0.18,
  tempDeep:    0.40,
  // Diversity (MMR): how hard to push away from recently-seen artist/country/tags.
  lambda: 0.6,
  // Artist cooldown: avoid repeating an artist within this many picks (per batch).
  artistCooldown: 6,
}

export const RAMP_LENGTH = 15  // session depth over which the feel opens up
const VARIETY_WINDOW = 8       // last N session tracks seeded into the diversity window

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

interface WindowEntry {
  artist: string | null
  country: string | null
  tags: Set<string>
}

function similarity(c: WindowEntry, r: WindowEntry): number {
  const a  = c.artist  && r.artist  && c.artist  === r.artist  ? 1 : 0
  const co = c.country && r.country && c.country === r.country ? 1 : 0
  const j  = jaccard(c.tags, r.tags)
  return Math.min(1, 0.5 * a + 0.3 * co + 0.7 * j)
}

export interface SelectOptions {
  sessionDepth?: number
  isWhirl?: boolean
  sessionTags?: string[][]
  batchSize?: number
  rng?: Rng
}

export interface SelectDebug {
  poolSize: number
  strataSizes: [number, number, number]
  mix: [number, number, number]
  temp: number
  t: number
  batch: number
  distinctArtists: number
  distinctAreas: number
  interestMin: number
  interestMedian: number
  interestMax: number
}

/** Choose a diverse, interest-weighted batch from a candidate pool. */
export function selectBatch(
  pool: DiscoveryRow[],
  opts: SelectOptions = {},
): { picked: DiscoveryRow[]; debug: SelectDebug } {
  const C = DISCOVERY_CONFIG
  const batchSize = opts.batchSize ?? 30
  const rng = opts.rng ?? Math.random
  const sessionDepth = opts.sessionDepth ?? 0
  const isWhirl = Boolean(opts.isWhirl)

  const entryOf = (r: DiscoveryRow): WindowEntry => ({
    artist:  r.artist_mb_id || r.artist_name || null,
    country: r.country || null,
    tags:    new Set((r.tags || []).map(String)),
  })

  // ── Interest score ─────────────────────────────────────────────────────────
  // Prefer the precomputed interest_score (Phase 2) when every row carries one;
  // otherwise derive it pool-locally from quality + gem + tag-distinctiveness.
  const usePre = pool.length > 0 && pool.every(r => Number.isFinite(r.interest_score as number))

  let interestOf: (r: DiscoveryRow) => number
  if (usePre) {
    const maxI = Math.max(1e-6, ...pool.map(r => r.interest_score as number))
    interestOf = (r) => (r.interest_score as number) / maxI
  } else {
    const tagDf = new Map<string, number>()
    for (const r of pool) {
      for (const t of new Set((r.tags || []).map(String))) tagDf.set(t, (tagDf.get(t) || 0) + 1)
    }
    const idf = (t: string) => Math.log(pool.length / (1 + (tagDf.get(t) || 0)))
    const maxQ = Math.max(1, ...pool.map(r => Number(r.quality_score) || Number(r.weight) || 1))
    const maxTl = Math.max(1, ...pool.map(r => Math.log10((Number(r.track_listeners) || 0) + 10)))
    let maxIdf = 1e-6
    for (const r of pool) {
      const tags = (r.tags || [])
      const v = tags.length ? tags.reduce((s, t) => s + idf(String(t)), 0) / tags.length : 0
      if (v > maxIdf) maxIdf = v
    }
    interestOf = (r) => {
      const q = (Number(r.quality_score) || Number(r.weight) || 1) / maxQ
      const g = Math.log10((Number(r.track_listeners) || 0) + 10) / maxTl
      const tags = (r.tags || [])
      const d = tags.length ? (tags.reduce((s, t) => s + idf(String(t)), 0) / tags.length) / maxIdf : 0
      return C.wQuality * q + C.wGem * g + C.wDistinct * d
    }
  }

  const scored = pool.map(r => ({ row: r, interest: interestOf(r) }))

  // ── Strata: split the scored pool into high / mid / long-tail thirds ─────────
  scored.sort((a, b) => b.interest - a.interest)
  const third = Math.ceil(scored.length / 3)
  const strata = [
    scored.slice(0, third),
    scored.slice(third, 2 * third),
    scored.slice(2 * third),
  ]

  // Session position drives how far we open up. Whirl starts near the surprise end.
  let t = Math.max(0, Math.min(1, sessionDepth / RAMP_LENGTH))
  if (isWhirl) t = Math.max(t, 0.7)
  const mix = [0, 1, 2].map(i => lerp(C.mixShallow[i], C.mixDeep[i], t)) as [number, number, number]
  const temp = lerp(C.tempShallow, C.tempDeep, t)

  // Target counts per stratum (largest-remainder rounding to hit batchSize).
  const raw = mix.map(m => m * batchSize)
  const counts = raw.map(Math.floor)
  let assigned = counts.reduce((s, c) => s + c, 0)
  const rema = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac)
  for (let k = 0; assigned < batchSize && k < rema.length; k++, assigned++) counts[rema[k % rema.length].i]++

  // Interleaved slot order (round-robin) so the batch never front-loads a stratum.
  const remainingCounts = [...counts]
  const slots: number[] = []
  while (slots.length < batchSize && remainingCounts.some(c => c > 0)) {
    for (let s = 0; s < 3; s++) {
      if (remainingCounts[s] > 0) { slots.push(s); remainingCounts[s]-- }
      if (slots.length >= batchSize) break
    }
  }

  // ── Stochastic selection with MMR diversity + artist cooldown ────────────────
  const window: WindowEntry[] = (opts.sessionTags || []).slice(-VARIETY_WINDOW).map(tags => ({
    artist: null, country: null, tags: new Set((tags || []).map(String)),
  }))
  const recentArtists: (string | null)[] = []
  const picked: DiscoveryRow[] = []

  function simToWindow(e: WindowEntry): number {
    let m = 0
    for (const w of window) { const s = similarity(e, w); if (s > m) m = s }
    return m
  }

  function softmaxPick(cands: { row: DiscoveryRow; interest: number }[], allowRepeatArtist: boolean): number {
    const cooldown = new Set(recentArtists.slice(-C.artistCooldown).filter(Boolean) as string[])
    const adj = cands.map(c => {
      const e = entryOf(c.row)
      const blocked = !allowRepeatArtist && e.artist !== null && cooldown.has(e.artist)
      const score = c.interest - C.lambda * simToWindow(e)
      return { score, blocked }
    })
    const usable = adj.some(a => !a.blocked)
    const maxScore = Math.max(...adj.map(a => (usable && a.blocked ? -Infinity : a.score)))
    let total = 0
    const weights = adj.map(a => {
      if (usable && a.blocked) return 0
      const w = Math.exp((a.score - maxScore) / temp)
      total += w
      return w
    })
    let rnd = rng() * total
    for (let i = 0; i < weights.length; i++) { rnd -= weights[i]; if (rnd <= 0) return i }
    return weights.findIndex(w => w > 0)
  }

  function pickFromStratum(s: number): boolean {
    const order = [s, (s + 1) % 3, (s + 2) % 3]
    for (const idx of order) {
      const st = strata[idx]
      if (st.length === 0) continue
      let i = softmaxPick(st, false)
      if (i < 0) i = softmaxPick(st, true)
      if (i < 0) i = 0
      const chosen = st.splice(i, 1)[0]
      const e = entryOf(chosen.row)
      picked.push(chosen.row)
      window.push(e)
      if (window.length > 12) window.shift()
      recentArtists.push(e.artist)
      return true
    }
    return false
  }

  for (const s of slots) {
    if (picked.length >= batchSize) break
    if (!pickFromStratum(s)) break
  }

  const interests = picked.map(interestOf).sort((a, b) => a - b)
  const debug: SelectDebug = {
    poolSize: pool.length,
    strataSizes: strata.map(s => s.length) as [number, number, number],
    mix, temp, t,
    batch: picked.length,
    distinctArtists: new Set(picked.map(r => r.artist_mb_id || r.artist_name)).size,
    distinctAreas: new Set(picked.map(r => r.macro_area)).size,
    interestMin: interests[0] ?? 0,
    interestMedian: interests[Math.floor(interests.length / 2)] ?? 0,
    interestMax: interests[interests.length - 1] ?? 0,
  }

  return { picked, debug }
}

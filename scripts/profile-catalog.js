// One-off: profile the PLAYABLE catalog to inform minimum-quality criteria.
// Samples playable rows and reports distributions (weight, tags, apple_music_id, source, junk titles).
const fs = require('fs')
const path = require('path')

const envText = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const env = {}
for (const line of envText.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#') || !t.includes('=')) continue
  const i = t.indexOf('=')
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^"|"$/g, '')
}

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const PLAYABLE = 'apple_music_id.not.is.null,itunes_preview_url.not.is.null'
const JUNK = /\b(interview|commentary|karaoke|tribute|backing track|made famous|originally performed|spoken|narration|audiobook)\b/i

;(async () => {
  // fetch a sample of playable tracks
  const rows = []
  for (let page = 0; page < 12; page++) {
    const { data, error } = await sb.from('tracks')
      .select('weight, tags, apple_music_id, itunes_preview_url, artist_mb_id, title, macro_area')
      .or(PLAYABLE)
      .range(page * 1000, page * 1000 + 999)
    if (error) { console.error('query error:', error.message); break }
    if (!data || !data.length) break
    rows.push(...data)
  }
  const n = rows.length
  if (!n) { console.log('no rows'); return }

  const pct = (c) => `${Math.round((c / n) * 100)}%`
  const weights = rows.map(r => Number(r.weight) || 0).sort((a, b) => a - b)
  const q = (p) => weights[Math.floor(p * (weights.length - 1))]
  const wBelow = (t) => rows.filter(r => (Number(r.weight) || 0) < t).length

  const hasTags = rows.filter(r => Array.isArray(r.tags) && r.tags.length > 0).length
  const tags2   = rows.filter(r => Array.isArray(r.tags) && r.tags.length >= 2).length
  const apple   = rows.filter(r => r.apple_music_id).length
  const previewOnly = rows.filter(r => !r.apple_music_id && r.itunes_preview_url).length
  const synthetic = rows.filter(r => /^(wd:|dg:|fw:|sp:|lf:)/.test(String(r.artist_mb_id || ''))).length
  const junk = rows.filter(r => JUNK.test(String(r.title || ''))).length

  console.log(`\n=== PLAYABLE CATALOG PROFILE (sample n=${n}) ===\n`)
  console.log('weight  min/p10/p25/median/p75/p90/max:',
    weights[0], q(.10), q(.25), q(.50), q(.75), q(.90), weights[weights.length - 1])
  console.log('weight  < 2 :', pct(wBelow(2)), ' < 3 :', pct(wBelow(3)), ' < 5 :', pct(wBelow(5)), ' < 8 :', pct(wBelow(8)), ' < 12 :', pct(wBelow(12)))
  console.log('has ≥1 tag       :', pct(hasTags))
  console.log('has ≥2 tags      :', pct(tags2))
  console.log('apple_music_id   :', pct(apple))
  console.log('preview-only     :', pct(previewOnly))
  console.log('synthetic artist :', pct(synthetic), '(wd/dg/fw/sp/lf — not real MusicBrainz)')
  console.log('junk-ish title   :', pct(junk), '(interview/karaoke/tribute/etc.)')

  // combined floors: what % survives various criteria?
  const survives = (f) => pct(rows.filter(f).length)
  console.log('\n=== % surviving candidate floors ===')
  console.log('apple_music_id only                         :', survives(r => r.apple_music_id))
  console.log('apple + ≥1 tag                              :', survives(r => r.apple_music_id && r.tags?.length))
  console.log('apple + ≥1 tag + weight≥3                   :', survives(r => r.apple_music_id && r.tags?.length && (Number(r.weight)||0) >= 3))
  console.log('apple + ≥1 tag + weight≥5 + no junk         :', survives(r => r.apple_music_id && r.tags?.length && (Number(r.weight)||0) >= 5 && !JUNK.test(String(r.title||''))))
  console.log('apple + ≥1 tag + weight≥8 + no junk         :', survives(r => r.apple_music_id && r.tags?.length && (Number(r.weight)||0) >= 8 && !JUNK.test(String(r.title||''))))
})()

// Geography display helpers.

// Each macro-area sits at a bearing on the compass dial (degrees, 0 = North, clockwise),
// arranged roughly by real-world geography. The flow's needle swings to point toward the
// region the current track comes from — "the compass points to where the music is from".
export const AREA_BEARING: Record<string, number> = {
  'Europe':         0,
  'Middle East':    40,
  'South Asia':     75,
  'East Asia':      110,
  'Southeast Asia': 140,
  'Oceania':        170,
  'Latin America':  210,
  'Caribbean':      245,
  'North America':  290,
  'West Africa':    325,
  'North Africa':   350,
}

// Bearing in degrees for a macro-area, or null if unknown.
export function bearingFor(area: string | null | undefined): number | null {
  if (!area) return null
  return area in AREA_BEARING ? AREA_BEARING[area] : null
}

// ISO 3166 country code → English display name (e.g. "ET" → "Ethiopia").
// Falls back to the raw code if the runtime lacks Intl.DisplayNames or the code is unknown.
export function countryName(code: string): string {
  if (!code) return ''
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}

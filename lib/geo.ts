// Geography display helpers.

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

import daily from '@/data/daily.json'
import { bearingFor } from '@/lib/geo'

export interface DailyDestination {
  country: string   // ISO 3166
  name: string      // display name
  decade: number    // 1950, 1960, …
}

// Macro-area di ciascuna destinazione del giorno (per la bussola del daily hero:
// "the compass points to …"). Best-effort sul set coarse di 11 macro-aree —
// serve solo a orientare l'ago. Copre i paesi presenti in daily.json.
const DAILY_AREA: Record<string, string> = {
  ET: 'Middle East', BR: 'Latin America', JM: 'Caribbean', TR: 'Middle East',
  CU: 'Caribbean', NG: 'West Africa', JP: 'East Asia', IN: 'South Asia',
  ML: 'West Africa', EG: 'North Africa', CO: 'Latin America', GH: 'West Africa',
  FR: 'Europe', SN: 'West Africa', PE: 'Latin America', DE: 'Europe',
  LB: 'Middle East', ID: 'Southeast Asia', AR: 'Latin America', ZA: 'West Africa',
  GR: 'Europe', MX: 'Latin America', PK: 'South Asia', GB: 'Europe',
  MA: 'North Africa', KR: 'East Asia', CV: 'West Africa', AU: 'Oceania',
  TH: 'Southeast Asia', US: 'North America',
}

// Same destination for everyone, rotating once per UTC day, cycling the list.
export function getDailyDestination(date: Date = new Date()): DailyDestination {
  const list = daily.destinations as DailyDestination[]
  const utcDay = Math.floor(date.getTime() / 86_400_000)
  return list[utcDay % list.length]
}

export function dailyLabel(d: DailyDestination): string {
  return `${d.name}, ${d.decade}s`
}

// Bussola del daily hero: direzione (gradi, 0 = N) verso la regione della
// destinazione, o null se ignota (la bussola fa un nudge invece di puntare).
export function dailyBearing(d: DailyDestination): number | null {
  return bearingFor(DAILY_AREA[d.country] ?? null)
}

import daily from '@/data/daily.json'

export interface DailyDestination {
  country: string   // ISO 3166
  name: string      // display name
  decade: number    // 1950, 1960, …
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

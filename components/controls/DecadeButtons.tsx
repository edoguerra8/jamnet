'use client'

// Righello anni (variante A del redesign): scala da strumento, eco dei ticks della
// bussola. Multi-selezione anche NON contigua via tap sui singoli tick (sez. 4.2).
// `selected` vuoto = tutte le epoche (default). `now` = nuove uscite (is_new_release).

export const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]

interface Props {
  selected: number[]
  now: boolean
  onChange: (decades: number[], now: boolean) => void
}

// 9 tacche (8 decenni + Now), centri spaziati e rientrati ai bordi così barra/handle
// e tick condividono la stessa base di coordinate.
const SLOTS = DECADES.length + 1
function leftPct(i: number): number {
  return 4 + (i / (SLOTS - 1)) * 92
}

// Run contigui (per indice) tra i decenni selezionati → barra + handle agli estremi.
function contiguousRuns(indices: number[]): [number, number][] {
  const s = [...indices].sort((a, b) => a - b)
  const runs: [number, number][] = []
  for (const i of s) {
    const last = runs[runs.length - 1]
    if (last && i === last[1] + 1) last[1] = i
    else runs.push([i, i])
  }
  return runs
}

export default function DecadeButtons({ selected, now, onChange }: Props) {
  const isAll = selected.length === 0

  const toggleDecade = (d: number) => {
    let next: number[]
    if (isAll) next = [d]
    else if (selected.includes(d)) next = selected.filter(x => x !== d)
    else next = [...selected, d]
    if (next.length === DECADES.length) next = []   // tutti = "tutte le epoche"
    onChange(next, now)
  }

  // Readout intervallo
  let readout = 'All eras'
  {
    const parts: string[] = []
    if (!isAll) {
      const s = [...selected].sort((a, b) => a - b)
      const contig = s.every((d, i) => i === 0 || d - s[i - 1] === 10)
      if (s.length === 1) parts.push(`${s[0]}s`)
      else if (contig) parts.push(`${s[0]} — ${s[s.length - 1]}`)
      else parts.push(`${s.length} eras`)
    }
    if (now) parts.push('Now')
    if (parts.length) readout = parts.join(' · ')
  }

  const selectedIdx = isAll ? [] : DECADES.map((d, i) => (selected.includes(d) ? i : -1)).filter(i => i >= 0)
  const runs = contiguousRuns(selectedIdx)

  return (
    <div>
      {/* label ERA + hairline + readout */}
      <div className="flex items-center gap-[9px] mb-6">
        <span className="text-[10px] font-sans uppercase tracking-[2px] text-muted">Era</span>
        <span className="flex-1 h-px bg-border" />
        <span className="text-[11px] font-sans text-pine tnum">{readout}</span>
      </div>

      {/* scala */}
      <div className="relative h-8 select-none">
        {/* baseline */}
        <span className="absolute top-[9px] h-px bg-[#D8D2C4]" style={{ left: '4%', right: '4%' }} />

        {/* barre pino dei run contigui + handle agli estremi */}
        {runs.map(([a, b], i) => (
          <span key={`run-${i}`}>
            <span
              className="absolute top-[9px] h-[2px] bg-pine -translate-y-1/2"
              style={{ left: `${leftPct(a)}%`, width: `${leftPct(b) - leftPct(a)}%` }}
            />
            <span
              className="absolute top-[9px] w-[9px] h-[9px] rounded-full bg-pine -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${leftPct(a)}%` }}
            />
            {b !== a && (
              <span
                className="absolute top-[9px] w-[9px] h-[9px] rounded-full bg-pine -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${leftPct(b)}%` }}
              />
            )}
          </span>
        ))}

        {/* tacche decenni */}
        {DECADES.map((d, i) => {
          const sel = !isAll && selected.includes(d)
          return (
            <button
              key={d}
              onClick={() => toggleDecade(d)}
              aria-pressed={sel}
              aria-label={`${d}s`}
              className="absolute top-0 -translate-x-1/2 flex flex-col items-center gap-2 py-1 tnum"
              style={{ left: `${leftPct(i)}%` }}
            >
              <span className={`w-px h-[9px] ${sel ? 'bg-pine' : 'bg-[#C9C3B5]'}`} />
              <span className={`text-[11px] ${sel ? 'text-pine font-semibold' : 'text-faint'}`}>
                &apos;{String(d).slice(2)}
              </span>
            </button>
          )
        })}

        {/* nodo Now (nuove uscite) */}
        <button
          onClick={() => onChange(selected, !now)}
          aria-pressed={now}
          aria-label="New releases"
          className="absolute top-0 -translate-x-1/2 flex flex-col items-center gap-2 py-1"
          style={{ left: `${leftPct(SLOTS - 1)}%` }}
        >
          <span className={`w-[5px] h-[5px] mt-[2px] rounded-full border ${now ? 'border-pine bg-pine' : 'border-[#C9C3B5]'}`} />
          <span className={`text-[11px] ${now ? 'text-pine font-semibold' : 'text-faint'}`}>Now</span>
        </button>
      </div>
    </div>
  )
}

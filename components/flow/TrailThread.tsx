'use client'

// Horizontal breadcrumb of the journey: recent tracks as dots + "Country 'YY",
// the current one highlighted in pine. Shows where the flow has travelled.
export interface TrailItem {
  id: string
  label: string
  current: boolean
}

export default function TrailThread({ items }: { items: TrailItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="relative">
      <div className="absolute left-[6%] right-[6%] top-1 h-px bg-[#D8D2C4]" />
      <div className="flex justify-between relative">
        {items.map(it => (
          <div key={it.id} className="flex flex-col items-center gap-[7px] min-w-0">
            <span className={`rounded-full ${it.current ? 'w-[9px] h-[9px] bg-pine -mt-px' : 'w-[7px] h-[7px] bg-[#CFC8B8]'}`} />
            <span className={`text-[10px] font-sans truncate max-w-[78px] ${it.current ? 'text-pine font-semibold' : 'text-faint'}`}>
              {it.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

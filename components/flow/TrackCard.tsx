'use client'
import { motion } from 'framer-motion'
import CompassIcon from '@/components/ui/CompassIcon'
import { Track } from '@/lib/types'
import { countryName } from '@/lib/geo'

interface Props {
  track: Track
  usingPreview: boolean
  onArtistTap: () => void
  onCountryTap: (code: string) => void
  onAreaTap: (area: string) => void
  onYearTap: (year: number) => void
}

// Keyed remount on track change → a clean fade-in dissolve.
export default function TrackCard({
  track, usingPreview, onArtistTap, onCountryTap, onAreaTap, onYearTap,
}: Props) {
  const displayCountry = countryName(track.country)
  // Genre chips only — drop tags that just echo the artist / country / area.
  const drop = new Set([track.artist, track.country, track.macroArea, displayCountry].map(s => (s || '').toLowerCase()))
  const chips = (track.tags || []).filter(t => t && !drop.has(t.toLowerCase())).slice(0, 3)

  return (
    <motion.div
      key={track.id}
      className="w-full flex flex-col items-center justify-center gap-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
    >
      {/* Album art */}
      <div className="w-full max-w-[236px] aspect-square rounded-[14px] overflow-hidden bg-surface border border-border relative">
        {track.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.artworkUrl} alt="" className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <CompassIcon size={48} className="text-muted/40" />
          </div>
        )}
        {usingPreview && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-ink/60 text-sand text-[10px] font-sans tracking-wide">
            preview
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="w-full max-w-[262px]">
        <h1 className="font-serif text-[25px] leading-[1.15] mb-[5px]">{track.title}</h1>
        <button
          onClick={onArtistTap}
          className="block text-[15px] font-sans opacity-70 hover:opacity-100 hover:text-pine transition-colors duration-200 text-left mb-[9px]"
        >
          {track.artist}
        </button>
        <div className="flex flex-wrap items-center gap-2 text-[13px] font-sans text-muted mb-[11px]">
          {displayCountry && (
            <button onClick={() => onCountryTap(track.country)} className="hover:text-pine transition-colors duration-200">{displayCountry}</button>
          )}
          {displayCountry && track.macroArea && <span className="opacity-40">·</span>}
          {track.macroArea && (
            <button onClick={() => onAreaTap(track.macroArea)} className="hover:text-pine transition-colors duration-200">{track.macroArea}</button>
          )}
          {Boolean(track.year) && (
            <>
              <span className="opacity-40">·</span>
              <button onClick={() => onYearTap(track.year)} className="hover:text-pine transition-colors duration-200 tabular-nums">{track.year}</button>
            </>
          )}
          {track.isNewRelease && (
            <span className="ml-1 px-1.5 py-0.5 rounded border border-pine/50 text-pine text-[10px] tracking-wide uppercase">New release</span>
          )}
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-[7px]">
            {chips.map(tag => (
              <span key={tag} className="px-[11px] py-1 rounded-[8px] border border-border text-[11.5px] font-sans text-muted capitalize">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

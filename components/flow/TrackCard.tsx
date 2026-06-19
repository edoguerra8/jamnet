'use client'
import { motion } from 'framer-motion'
import CompassIcon from '@/components/ui/CompassIcon'
import { Track } from '@/lib/types'
import { countryName } from '@/lib/geo'

interface Props {
  track: Track
  usingPreview: boolean
  scrubbing: 1 | -1 | null
  onArtistTap: () => void
  onCountryTap: (code: string) => void
  onAreaTap: (area: string) => void
  onYearTap: (year: number) => void
}

export default function TrackCard({
  track, usingPreview, scrubbing, onArtistTap, onCountryTap, onAreaTap, onYearTap,
}: Props) {
  const displayCountry = countryName(track.country)

  // Keyed remount on track change → a clean fade-in dissolve. No AnimatePresence:
  // mode="wait" can deadlock under frequent parent re-renders, freezing the card.
  return (
      <motion.div
        key={track.id}
        className="w-full flex-1 flex flex-col items-center justify-center gap-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: scrubbing ? 0.05 : 0.25, ease: 'easeInOut' }}
      >
        {/* Album art */}
        <div className="w-full max-w-xs aspect-square rounded-xl overflow-hidden bg-surface border border-border relative">
          {track.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.artworkUrl} alt="" className="w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <CompassIcon size={48} className="text-muted/40" />
            </div>
          )}

          {/* Fast-scrub overlay — the "tape running" feel */}
          {scrubbing && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink/30">
              <span className="text-sand text-2xl font-sans tracking-[0.3em] tabular-nums">
                {scrubbing === 1 ? '⏩' : '⏪'}
              </span>
            </div>
          )}

          {usingPreview && !scrubbing && (
            <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-ink/60 text-sand text-[10px] font-sans tracking-wide">
              preview
            </div>
          )}
        </div>

        {/* Track info */}
        <div className="w-full max-w-xs flex flex-col gap-1">
          <h1 className="font-serif text-[1.6rem] leading-tight">{track.title}</h1>
          <button
            onClick={onArtistTap}
            className="self-start text-base font-sans opacity-65 hover:opacity-100 hover:text-pine transition-colors duration-200 text-left"
          >
            {track.artist}
          </button>
          <div className="flex flex-wrap items-center gap-2 text-[13px] font-sans text-muted">
            {displayCountry && (
              <button onClick={() => onCountryTap(track.country)} className="hover:text-pine transition-colors duration-200">
                {displayCountry}
              </button>
            )}
            {displayCountry && track.macroArea && <span className="opacity-40">·</span>}
            {track.macroArea && (
              <button onClick={() => onAreaTap(track.macroArea)} className="hover:text-pine transition-colors duration-200">
                {track.macroArea}
              </button>
            )}
            {Boolean(track.year) && (
              <>
                <span className="opacity-40">·</span>
                <button onClick={() => onYearTap(track.year)} className="hover:text-pine transition-colors duration-200 tabular-nums">
                  {track.year}
                </button>
              </>
            )}
            {track.isNewRelease && (
              <span className="ml-1 px-1.5 py-0.5 rounded border border-pine/50 text-pine text-[10px] tracking-wide uppercase">
                New release
              </span>
            )}
          </div>
        </div>
      </motion.div>
  )
}

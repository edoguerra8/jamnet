'use client'
import { motion } from 'framer-motion'

interface Props {
  /** Continuous full rotation — while searching / loading */
  spinning?: boolean
  /** Point the needle to this bearing in degrees (0 = N, clockwise); swings smoothly between values */
  bearing?: number | null
  /** Change this key to make the needle swing once and settle (when no bearing) */
  nudge?: number | string
  /** Solo anello + ago (niente ticks/etichette/anello interno) — per usi piccoli (daily hero, top-bar) */
  minimal?: boolean
  size?: number
  className?: string
}

// Brand compass (sistema "Sabbia / Pino"): anello + 24 ticks (cardinali più lunghi,
// tick N in pino) + ago a rombo (nord pino, sud inchiostro tenue) + perno pino.
// Usata come marchio (Landing/Gate, grande) e come indicatore (Home daily, Flow:
// `bearing` punta verso la regione del brano). Anello/ticks ereditano `currentColor`,
// l'accento è sempre pino.
export default function CompassIcon({ spinning = false, bearing = null, nudge, minimal = false, size = 24, className = '' }: Props) {
  const pointing = !spinning && typeof bearing === 'number'

  // Stable key while pointing so the needle TWEENS between bearings instead of remounting.
  const key = spinning ? 'spin' : pointing ? 'bearing' : `still-${nudge ?? 0}`

  const animate = spinning
    ? { rotate: 360 }
    : pointing
      ? { rotate: bearing as number }
      : { rotate: [0, 26, -16, 8, -3, 0] }

  const transition = spinning
    ? { duration: 1.6, repeat: Infinity, ease: 'linear' as const }
    : pointing
      ? { type: 'spring' as const, stiffness: 80, damping: 14 }
      : { duration: 0.9, ease: 'easeInOut' as const }

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} fill="none" className={className}>
      {/* Anello esterno */}
      <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth={minimal ? 1.1 : 0.8} opacity={minimal ? 0.4 : 0.45} />

      {!minimal && (
        <>
          <circle cx="100" cy="100" r="72" stroke="currentColor" strokeWidth="0.5" opacity="0.15" />

          {/* Ticks — N in pino, cardinali (E/S/W) e diagonali più marcati */}
          <line x1="100" y1="24" x2="100" y2="10" stroke="var(--color-pine)" strokeWidth="1.1" opacity="0.8" />
          <line x1="122" y1="17.9" x2="123.3" y2="13.1" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
          <line x1="142.5" y1="26.4" x2="145" y2="22.1" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
          <line x1="157.3" y1="42.7" x2="163.6" y2="36.4" stroke="currentColor" strokeWidth="0.7" opacity="0.35" />
          <line x1="173.6" y1="57.5" x2="177.9" y2="55" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
          <line x1="182.1" y1="78" x2="186.9" y2="76.7" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
          <line x1="176" y1="100" x2="190" y2="100" stroke="currentColor" strokeWidth="1.1" opacity="0.5" />
          <line x1="182.1" y1="122" x2="186.9" y2="123.3" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
          <line x1="173.6" y1="142.5" x2="177.9" y2="145" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
          <line x1="157.3" y1="157.3" x2="163.6" y2="163.6" stroke="currentColor" strokeWidth="0.7" opacity="0.35" />
          <line x1="142.5" y1="173.6" x2="145" y2="177.9" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
          <line x1="122" y1="182.1" x2="123.3" y2="186.9" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
          <line x1="100" y1="176" x2="100" y2="190" stroke="currentColor" strokeWidth="1.1" opacity="0.5" />
          <line x1="78" y1="182.1" x2="76.7" y2="186.9" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
          <line x1="57.5" y1="173.6" x2="55" y2="177.9" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
          <line x1="42.7" y1="157.3" x2="36.4" y2="163.6" stroke="currentColor" strokeWidth="0.7" opacity="0.35" />
          <line x1="26.4" y1="142.5" x2="22.1" y2="145" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
          <line x1="17.9" y1="122" x2="13.1" y2="123.3" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
          <line x1="24" y1="100" x2="10" y2="100" stroke="currentColor" strokeWidth="1.1" opacity="0.5" />
          <line x1="17.9" y1="78" x2="13.1" y2="76.7" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
          <line x1="26.4" y1="57.5" x2="22.1" y2="55" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
          <line x1="42.7" y1="42.7" x2="36.4" y2="36.4" stroke="currentColor" strokeWidth="0.7" opacity="0.35" />
          <line x1="57.5" y1="26.4" x2="55" y2="22.1" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
          <line x1="78" y1="17.9" x2="76.7" y2="13.1" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />

          {/* Etichette cardinali — N in pino, resto muto */}
          <text x="100" y="34" fontFamily="var(--font-hanken)" fontSize="9" fontWeight="600" fill="var(--color-pine)" textAnchor="middle" dominantBaseline="middle">N</text>
          <text x="166" y="100" fontFamily="var(--font-hanken)" fontSize="9" fill="var(--color-muted)" textAnchor="middle" dominantBaseline="middle">E</text>
          <text x="100" y="166" fontFamily="var(--font-hanken)" fontSize="9" fill="var(--color-muted)" textAnchor="middle" dominantBaseline="middle">S</text>
          <text x="34" y="100" fontFamily="var(--font-hanken)" fontSize="9" fill="var(--color-muted)" textAnchor="middle" dominantBaseline="middle">W</text>
        </>
      )}

      {/* Ago a rombo — nord pino, sud inchiostro tenue, perno pino */}
      <motion.g
        key={key}
        style={{ transformOrigin: '100px 100px' }}
        initial={{ rotate: 0 }}
        animate={animate}
        transition={transition}
      >
        <path d="M100,38 L94.5,100 L105.5,100 Z" fill="var(--color-pine)" />
        <path d="M100,162 L94.5,100 L105.5,100 Z" fill="var(--color-ink)" opacity="0.28" />
        <circle cx="100" cy="100" r="3.4" fill="var(--color-pine)" />
      </motion.g>
    </svg>
  )
}

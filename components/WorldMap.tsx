'use client'

// Stylized world map — 11 tappable macro-areas, flat palette tones,
// no national borders (sez. 4.1). Selected area = terracotta fill.

interface Props {
  selected: string[]            // empty = whole world (nothing highlighted)
  onToggle: (area: string) => void
  showLabels?: boolean
  className?: string
}

// Rounds polygon corners with quadratic curves so every zone keeps soft edges
function roundedPath(pts: [number, number][], r = 6): string {
  const n = pts.length
  let d = ''
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]
    const curr = pts[i]
    const next = pts[(i + 1) % n]
    const v1 = [curr[0] - prev[0], curr[1] - prev[1]]
    const v2 = [next[0] - curr[0], next[1] - curr[1]]
    const l1 = Math.hypot(v1[0], v1[1])
    const l2 = Math.hypot(v2[0], v2[1])
    const r1 = Math.min(r, l1 / 2)
    const r2 = Math.min(r, l2 / 2)
    const p1: [number, number] = [curr[0] - (v1[0] / l1) * r1, curr[1] - (v1[1] / l1) * r1]
    const p2: [number, number] = [curr[0] + (v2[0] / l2) * r2, curr[1] + (v2[1] / l2) * r2]
    d += i === 0 ? `M${p1[0]},${p1[1]} ` : `L${p1[0]},${p1[1]} `
    d += `Q${curr[0]},${curr[1]} ${p2[0]},${p2[1]} `
  }
  return d + 'Z'
}

interface Zone {
  area: string
  points: [number, number][]
  label: string
  labelPos: [number, number]
  tone: 1 | 2 | 3
  // extra dots for archipelagos (drawn in the zone color, part of the tap group)
  dots?: [number, number, number][]   // x, y, r
  // enlarged invisible hit area for small zones
  hit?: [number, number, number, number]  // x, y, w, h
}

const ZONES: Zone[] = [
  {
    area: 'North America', label: 'North America', labelPos: [68, 42], tone: 1,
    points: [[26, 54], [34, 22], [70, 12], [108, 16], [118, 32], [104, 46], [106, 58], [88, 70], [70, 78], [52, 70], [34, 66]],
  },
  {
    area: 'Caribbean', label: 'Caribbean', labelPos: [130, 78], tone: 2,
    points: [[96, 86], [104, 84], [112, 87], [120, 90], [124, 95], [116, 97], [106, 94], [97, 91]],
    dots: [[130, 96, 2.2], [136, 99, 1.8]],
    hit: [90, 78, 54, 26],
  },
  {
    area: 'Latin America', label: 'Latin America', labelPos: [108, 140], tone: 3,
    points: [[68, 80], [84, 86], [90, 98], [104, 102], [122, 110], [126, 126], [118, 150], [108, 176], [99, 184], [91, 162], [93, 134], [82, 112], [70, 94]],
  },
  {
    area: 'Europe', label: 'Europe', labelPos: [188, 36], tone: 2,
    points: [[160, 52], [158, 32], [168, 18], [192, 12], [214, 16], [218, 30], [208, 40], [212, 52], [196, 58], [178, 56]],
  },
  {
    area: 'North Africa', label: 'North Africa', labelPos: [182, 77], tone: 1,
    points: [[150, 66], [176, 60], [206, 62], [216, 72], [212, 88], [196, 94], [170, 92], [148, 84]],
  },
  {
    area: 'West Africa', label: 'West Africa', labelPos: [183, 122], tone: 2,
    points: [[150, 90], [170, 96], [196, 98], [210, 104], [212, 124], [202, 148], [190, 162], [180, 150], [170, 128], [154, 108]],
  },
  {
    area: 'Middle East', label: 'Middle East', labelPos: [232, 77], tone: 3,
    points: [[218, 60], [238, 58], [250, 70], [246, 86], [232, 96], [222, 86], [214, 72]],
  },
  {
    area: 'South Asia', label: 'South Asia', labelPos: [266, 86], tone: 1,
    points: [[252, 72], [268, 66], [282, 76], [278, 92], [268, 110], [260, 96], [250, 84]],
  },
  {
    area: 'East Asia', label: 'East Asia', labelPos: [288, 38], tone: 2,
    points: [[252, 60], [240, 40], [248, 22], [280, 14], [316, 20], [330, 36], [318, 52], [300, 60], [284, 68], [266, 64]],
  },
  {
    area: 'Southeast Asia', label: 'Southeast Asia', labelPos: [310, 130], tone: 3,
    points: [[288, 76], [300, 80], [306, 92], [318, 98], [330, 106], [322, 118], [306, 114], [294, 120], [286, 104], [282, 88]],
    dots: [[334, 116, 2.2], [298, 128, 2]],
  },
  {
    area: 'Oceania', label: 'Oceania', labelPos: [328, 158], tone: 1,
    points: [[306, 140], [330, 134], [348, 144], [350, 162], [336, 176], [316, 174], [304, 158]],
    dots: [[358, 180, 2.4], [362, 188, 2]],
  },
]

const TONES = {
  1: 'var(--color-map-1)',
  2: 'var(--color-map-2)',
  3: 'var(--color-map-3)',
}

export default function WorldMap({ selected, onToggle, showLabels = true, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 370 200"
      className={className}
      role="group"
      aria-label="World map — select areas"
    >
      {ZONES.map(zone => {
        const isSelected = selected.includes(zone.area)
        const fill = isSelected ? 'var(--color-terracotta)' : TONES[zone.tone]
        return (
          <g
            key={zone.area}
            role="button"
            aria-pressed={isSelected}
            aria-label={zone.area}
            onClick={(e) => { e.stopPropagation(); onToggle(zone.area) }}
            className="cursor-pointer"
            style={{ transition: 'opacity 200ms' }}
          >
            <path
              d={roundedPath(zone.points)}
              fill={fill}
              stroke="var(--color-ivory)"
              strokeWidth="1"
              style={{ transition: 'fill 250ms ease' }}
            />
            {zone.dots?.map(([x, y, r], i) => (
              <circle key={i} cx={x} cy={y} r={r} fill={fill} style={{ transition: 'fill 250ms ease' }} />
            ))}
            {zone.hit && (
              <rect
                x={zone.hit[0]} y={zone.hit[1]} width={zone.hit[2]} height={zone.hit[3]}
                fill="transparent"
              />
            )}
            {showLabels && (
              <text
                x={zone.labelPos[0]} y={zone.labelPos[1]}
                textAnchor="middle"
                fontSize="7.5"
                fontFamily="var(--font-sans)"
                fill="var(--color-ink)"
                stroke="var(--color-ivory)"
                strokeWidth="2.5"
                opacity={isSelected ? 0.95 : 0.7}
                pointerEvents="none"
                style={{ paintOrder: 'stroke' }}
              >
                {zone.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export const MACRO_AREAS = ZONES.map(z => z.area)

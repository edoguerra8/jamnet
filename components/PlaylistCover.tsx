// SVG covers for genre playlists and compilations — minimal line-art, design system palette

const IV = '#FAF7F2' // ivory
const TC = '#C4614A' // terracotta
const IN = '#2C2825' // ink
const PA = '#EEE8E0' // parchment
const MU = '#9A8F87' // muted

function WorldCover() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect width="100" height="100" fill={TC} />
      <circle cx="50" cy="50" r="30" fill="none" stroke={IV} strokeWidth="1.5" />
      <circle cx="50" cy="50" r="19" fill="none" stroke={IV} strokeWidth="1" />
      <line x1="20" y1="50" x2="80" y2="50" stroke={IV} strokeWidth="1.5" />
      <line x1="50" y1="20" x2="50" y2="80" stroke={IV} strokeWidth="1.5" />
      <ellipse cx="50" cy="50" rx="10" ry="30" fill="none" stroke={IV} strokeWidth="1" />
      <circle cx="50" cy="50" r="3" fill={IV} />
    </svg>
  )
}

function JazzCover() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect width="100" height="100" fill={IN} />
      <path d="M15 70 Q30 30 50 50 Q70 70 85 30" fill="none" stroke={IV} strokeWidth="2" strokeLinecap="round" />
      <circle cx="85" cy="30" r="6" fill={TC} />
      <path d="M15 80 Q35 55 55 65 Q75 75 90 50" fill="none" stroke={MU} strokeWidth="1" strokeLinecap="round" />
      <circle cx="15" cy="70" r="3" fill={IV} />
    </svg>
  )
}

function BluesCover() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect width="100" height="100" fill={IN} />
      <path d="M10 35 Q27 20 44 35 Q61 50 78 35 Q88 27 90 35" fill="none" stroke={TC} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M10 52 Q27 37 44 52 Q61 67 78 52 Q88 44 90 52" fill="none" stroke={TC} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 69 Q27 54 44 69 Q61 84 78 69 Q88 61 90 69" fill="none" stroke={TC} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="10" y1="82" x2="90" y2="82" stroke={MU} strokeWidth="0.8" />
    </svg>
  )
}

function SoulCover() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect width="100" height="100" fill={TC} />
      <circle cx="38" cy="50" r="22" fill="none" stroke={IV} strokeWidth="1.5" />
      <circle cx="62" cy="50" r="22" fill="none" stroke={IV} strokeWidth="1.5" />
      <circle cx="50" cy="50" r="8" fill={IV} />
    </svg>
  )
}

function FolkCover() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect width="100" height="100" fill={PA} />
      <polyline points="10,80 35,45 50,58 65,35 90,80" fill="none" stroke={IN} strokeWidth="2" strokeLinejoin="round" />
      <line x1="10" y1="80" x2="90" y2="80" stroke={IN} strokeWidth="1.5" />
      <circle cx="65" cy="22" r="5" fill="none" stroke={TC} strokeWidth="1.5" />
      <line x1="65" y1="17" x2="63" y2="11" stroke={TC} strokeWidth="1.2" />
      <line x1="63" y1="11" x2="67" y2="8" stroke={TC} strokeWidth="1.2" />
    </svg>
  )
}

function RockCover() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect width="100" height="100" fill={IN} />
      <polyline points="55,15 38,50 52,50 45,85" fill="none" stroke={TC} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <line x1="20" y1="50" x2="34" y2="50" stroke={MU} strokeWidth="1" />
      <line x1="66" y1="50" x2="80" y2="50" stroke={MU} strokeWidth="1" />
    </svg>
  )
}

function ClassicalCover() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect width="100" height="100" fill={PA} />
      <line x1="15" y1="38" x2="85" y2="38" stroke={IN} strokeWidth="1.2" />
      <line x1="15" y1="48" x2="85" y2="48" stroke={IN} strokeWidth="1.2" />
      <line x1="15" y1="58" x2="85" y2="58" stroke={IN} strokeWidth="1.2" />
      <line x1="15" y1="68" x2="85" y2="68" stroke={IN} strokeWidth="1.2" />
      <circle cx="38" cy="68" r="5" fill={IN} />
      <line x1="43" y1="68" x2="43" y2="38" stroke={IN} strokeWidth="1.5" />
      <circle cx="58" cy="58" r="5" fill={IN} />
      <line x1="63" y1="58" x2="63" y2="28" stroke={IN} strokeWidth="1.5" />
    </svg>
  )
}

function ElectronicCover() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect width="100" height="100" fill={IN} />
      {[25, 50, 75].map(x =>
        [25, 50, 75].map(y => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill={TC} />
        ))
      )}
      <line x1="25" y1="25" x2="50" y2="25" stroke={TC} strokeWidth="1" />
      <line x1="50" y1="25" x2="50" y2="50" stroke={TC} strokeWidth="1" />
      <line x1="50" y1="50" x2="75" y2="50" stroke={TC} strokeWidth="1" />
      <line x1="75" y1="50" x2="75" y2="75" stroke={TC} strokeWidth="1" />
      <line x1="25" y1="50" x2="25" y2="75" stroke={MU} strokeWidth="0.8" />
      <line x1="25" y1="75" x2="50" y2="75" stroke={MU} strokeWidth="0.8" />
    </svg>
  )
}

function PopCover() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect width="100" height="100" fill={TC} />
      {[
        [50, 30, 7], [25, 55, 5], [75, 45, 5], [40, 72, 4],
        [68, 70, 4], [20, 32, 3], [80, 25, 3], [55, 55, 3],
      ].map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill={IV} opacity={0.9 - i * 0.07} />
      ))}
    </svg>
  )
}

function CompilationCover() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect width="100" height="100" fill={IN} />
      <rect x="12" y="12" width="34" height="34" rx="4" fill={TC} />
      <rect x="54" y="12" width="34" height="34" rx="4" fill={MU} opacity="0.6" />
      <rect x="12" y="54" width="34" height="34" rx="4" fill={MU} opacity="0.6" />
      <rect x="54" y="54" width="34" height="34" rx="4" fill={TC} opacity="0.5" />
      <line x1="48" y1="12" x2="48" y2="88" stroke={IN} strokeWidth="3" />
      <line x1="12" y1="48" x2="88" y2="48" stroke={IN} strokeWidth="3" />
    </svg>
  )
}

const COVERS: Record<string, React.FC> = {
  World: WorldCover,
  Jazz: JazzCover,
  Blues: BluesCover,
  Soul: SoulCover,
  Folk: FolkCover,
  Rock: RockCover,
  Classical: ClassicalCover,
  Electronic: ElectronicCover,
  Pop: PopCover,
  Compilation: CompilationCover,
}

interface Props {
  genre: string
  className?: string
}

export default function PlaylistCover({ genre, className = '' }: Props) {
  const Cover = COVERS[genre] ?? WorldCover
  return (
    <div className={`rounded-lg overflow-hidden aspect-square ${className}`}>
      <Cover />
    </div>
  )
}

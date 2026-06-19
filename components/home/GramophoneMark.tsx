// Landing pictogram (sez. 4.1b): a seated figure listening to a gramophone.
// Terracotta silhouette on ivory, soft signpost-style shapes. SVG.

export default function GramophoneMark({ className = '' }: { className?: string }) {
  const TC = 'var(--color-terracotta)'
  return (
    <svg viewBox="0 0 240 180" className={className} role="img" aria-label="A person listening to a gramophone">
      {/* ground line */}
      <line x1="24" y1="150" x2="216" y2="150" stroke={TC} strokeWidth="2" strokeLinecap="round" opacity="0.4" />

      {/* seated figure (left), cross-legged, head tilted toward the music */}
      <g fill={TC}>
        {/* head */}
        <circle cx="66" cy="62" r="15" />
        {/* torso, leaning slightly toward the gramophone */}
        <path d="M58 78
                 q8 -6 18 0
                 q10 7 8 30
                 q-2 12 -18 12
                 q-16 0 -18 -12
                 q-2 -20 10 -30 z" />
        {/* crossed legs — a low rounded base */}
        <path d="M40 132
                 q26 -16 56 0
                 q6 4 0 9
                 q-28 8 -56 0
                 q-6 -5 0 -9 z" />
        {/* arm resting toward the horn */}
        <path d="M92 100 q22 4 30 16 q3 5 -3 7 q-6 1 -10 -4 q-9 -11 -20 -12 z" />
      </g>

      {/* gramophone (right) */}
      <g fill={TC}>
        {/* cabinet / base box */}
        <rect x="150" y="120" width="46" height="22" rx="4" />
        {/* turntable nub */}
        <rect x="168" y="112" width="10" height="10" rx="2" />
        {/* tone arm rising from the box */}
        <path d="M173 112 q2 -22 18 -34" stroke={TC} strokeWidth="4" fill="none" strokeLinecap="round" />
        {/* flared horn opening toward the figure */}
        <path d="M191 78
                 q18 -16 30 -2
                 q6 7 1 14
                 q-6 8 -22 6
                 q-16 -2 -16 -10
                 q0 -5 7 -8 z" />
        {/* horn mouth highlight */}
        <ellipse cx="186" cy="84" rx="6" ry="13" fill="var(--color-ivory)" opacity="0.5" />
      </g>

      {/* a few sound notes drifting from the horn toward the figure */}
      <g fill={TC} opacity="0.7">
        <circle cx="150" cy="64" r="3.5" />
        <circle cx="128" cy="52" r="3" />
        <circle cx="108" cy="44" r="2.4" />
      </g>
    </svg>
  )
}

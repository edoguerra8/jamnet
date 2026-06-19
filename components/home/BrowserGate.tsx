'use client'
import GramophoneMark from './GramophoneMark'

// Non-Safari / non-Apple gate (sez. 4.0): one sober screen, no jargon, no broken UI.
export default function BrowserGate() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-8 pt-safe pb-safe text-center">
      <div className="w-full max-w-sm flex flex-col items-center gap-10">
        <GramophoneMark className="w-48 h-auto opacity-90" />
        <div className="flex flex-col gap-3">
          <h1 className="font-serif text-2xl leading-tight">JamNet plays through Apple Music</h1>
          <p className="font-sans text-muted text-[15px] leading-relaxed">
            Open JamNet in Safari on an iPhone, iPad, or Mac to start listening.
          </p>
        </div>
      </div>
    </main>
  )
}

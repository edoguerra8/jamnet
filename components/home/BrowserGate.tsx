'use client'
import { useState } from 'react'
import CompassIcon from '@/components/ui/CompassIcon'

// Non-Safari / non-Apple gate (sez. 4.0): one sober screen, no jargon, no broken UI.
// "Copy link" is the only help — bring the address to Safari.
export default function BrowserGate() {
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <main className="min-h-dvh flex flex-col bg-sand text-ink px-9 pt-safe pb-safe">
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col pt-16 pb-11">
        <div className="text-[11px] font-sans uppercase tracking-[3.5px] text-muted text-center">JamNet</div>

        <div className="flex-1 flex flex-col items-center justify-center gap-8 text-center">
          <CompassIcon size={118} className="text-ink" />

          <div>
            <h1 className="font-serif text-[30px] leading-[1.2] mb-3.5">Best heard on Safari</h1>
            <p className="text-[14.5px] font-sans leading-relaxed text-muted max-w-[268px] mx-auto">
              JamNet plays through Apple Music. Open it in Safari — on iPhone, iPad, or Mac — to start listening.
            </p>
          </div>

          <div className="flex items-center gap-4 text-muted">
            <span className="text-[12px] font-sans">iPhone</span>
            <span className="w-[3px] h-[3px] rounded-full bg-faint" />
            <span className="text-[12px] font-sans">iPad</span>
            <span className="w-[3px] h-[3px] rounded-full bg-faint" />
            <span className="text-[12px] font-sans">Mac</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-[9px] px-[22px] py-[13px] rounded-[14px] border border-faint text-ink text-[14px] font-sans font-medium active:scale-[0.99] transition-transform duration-200"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" className="opacity-70">
              <rect x="9" y="9" width="11" height="11" rx="2.5" />
              <path d="M5 15V5a2 2 0 0 1 2-2h8" strokeLinecap="round" />
            </svg>
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <div className="text-[11.5px] font-sans text-faint">jamnet.app</div>
        </div>
      </div>
    </main>
  )
}

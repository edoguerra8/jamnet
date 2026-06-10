'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getRandomSuggestions, HOME_SUGGESTIONS } from '@/lib/discovery'

type Suggestion = typeof HOME_SUGGESTIONS[number]

export default function Home() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])

  useEffect(() => {
    setSuggestions(getRandomSuggestions(3))
  }, [])

  const go = (q: string) => {
    router.push(`/flow?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 pt-safe pb-safe">
      {/* Wordmark */}
      <div className="absolute top-6 left-6 pt-safe">
        <span className="font-serif text-lg tracking-tight opacity-90">JamNet</span>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-10">
        {/* Search bar */}
        <form
          onSubmit={(e) => { e.preventDefault(); go(query) }}
          className="flex flex-col gap-0"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="An artist, a place, a mood…"
            className="w-full px-0 py-3 text-xl font-serif bg-transparent border-b border-ink/20 dark:border-ivory/20 focus:outline-none focus:border-terracotta placeholder:text-muted/50 transition-colors"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </form>

        {/* Suggestions */}
        <div className="flex flex-col gap-1">
          {suggestions.map((s) => (
            <button
              key={s.label}
              onClick={() => go(s.query)}
              className="text-left py-2 text-[15px] font-sans text-muted hover:text-terracotta transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Play anything */}
        <button
          onClick={() => go('')}
          className="self-start flex items-center gap-3 group"
        >
          <span className="w-10 h-10 flex items-center justify-center rounded-full border border-ink/20 dark:border-ivory/20 group-hover:border-terracotta transition-colors shrink-0">
            <svg viewBox="0 0 16 16" width="14" height="14" className="translate-x-0.5 group-hover:text-terracotta transition-colors" fill="currentColor">
              <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
            </svg>
          </span>
          <span className="text-sm font-sans text-muted group-hover:text-terracotta transition-colors">
            Play anything
          </span>
        </button>
      </div>
    </main>
  )
}

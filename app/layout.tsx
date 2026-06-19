import type { Metadata, Viewport } from 'next'
import { Newsreader, Hanken_Grotesk } from 'next/font/google'
import './globals.css'

// Serif — titoli, claim, titoli brano/playlist.
const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-newsreader',
  display: 'swap',
})

// Sans — UI, corpo, label, bottoni.
const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-hanken',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'JamNet',
  description: 'Music around the world, one song at a time.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${hanken.variable} h-full`}>
      <body className="min-h-full font-sans bg-sand text-ink antialiased">
        {children}
      </body>
    </html>
  )
}

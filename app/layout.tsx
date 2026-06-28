import type { Metadata, Viewport } from 'next'
import { Lora, Inter } from 'next/font/google'
import './globals.css'

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'JamNet',
  description: 'Drop the needle anywhere in the world. Discover music from everywhere, every era.',
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
    <html lang="en" className={`${lora.variable} ${inter.variable} h-full`}>
      <body className="min-h-full font-sans bg-ivory text-ink antialiased">
        {children}
      </body>
    </html>
  )
}

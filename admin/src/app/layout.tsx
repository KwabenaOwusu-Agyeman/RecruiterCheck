import type { Metadata } from 'next'
import { Inter, Fraunces } from 'next/font/google'
import './globals.css'

// next/font downloads and self-hosts at build time, so the page makes no
// request to fonts.gstatic.com at all. That is both faster and one fewer
// third-party origin the CSP has to allow.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' })

export const metadata: Metadata = {
  title: 'MyRecruiterCheck Control Centre',
  description: 'Private operations dashboard.',
  // Belt and braces alongside the X-Robots-Tag header and robots.txt. None of
  // these is a security control; authorisation is enforced server-side.
  robots: { index: false, follow: false, nocache: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen bg-background">{children}</body>
    </html>
  )
}

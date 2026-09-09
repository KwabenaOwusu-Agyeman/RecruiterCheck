import { type ReactNode } from 'react'
import { BackLink } from '@/components/ui/BackLink'
import { Container } from '@/components/ui/Container'
import { Logo } from '@/components/ui/Logo'
import { MAIN_LANDMARK_ID, SkipLink } from '@/components/ui/SkipLink'

interface LegalLayoutProps {
  title: string
  updated: string
  /**
   * Whether this page owns its own `main` landmark and skip link.
   *
   * True for the five routed outside PublicLayout, which is every legal page:
   * without this their heading and body sat in no landmark at all, so a screen
   * reader user had no way to skip the header.
   *
   * /about is the one exception. It renders inside PublicLayout, which already
   * provides both, and a second `main` would nest exactly as 26 pages did
   * before PR #74.
   */
  standalone?: boolean
  children: ReactNode
}

export function LegalLayout({ title, updated, standalone = true, children }: LegalLayoutProps) {
  const content = (
    <Container className="max-w-3xl pb-12 pt-4 sm:pb-[56px] sm:pt-8 lg:max-w-[760px]">
      <BackLink />
      <h1 className="font-display mt-3 text-2xl font-semibold tracking-tight text-text-primary sm:mt-6 sm:text-[32px]">
        {title}
      </h1>
      <p className="mt-2 text-sm text-text-secondary">Last updated: {updated}</p>

      <div className="mt-6 space-y-6 sm:mt-10 sm:space-y-8 lg:leading-[1.7]">{children}</div>
    </Container>
  )

  return (
    <div className="min-h-screen bg-background">
      {standalone ? <SkipLink /> : null}
      <header className="border-b border-border">
        <Container>
          <div className="flex h-16 items-center">
            <Logo />
          </div>
        </Container>
      </header>

      {/* The landmark wraps the content only, never the header above it. */}
      {standalone ? (
        <main id={MAIN_LANDMARK_ID} tabIndex={-1} className="focus:outline-none">
          {content}
        </main>
      ) : (
        content
      )}
    </div>
  )
}

interface SectionProps {
  title: string
  children: ReactNode
}

export function Section({ title, children }: SectionProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-text-primary sm:text-xl">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-text-secondary sm:text-base lg:leading-[1.7]">
        {children}
      </div>
    </section>
  )
}

import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BackLink } from '@/components/ui/BackLink'
import { Container } from '@/components/ui/Container'
import { Logo } from '@/components/ui/Logo'

interface LegalLayoutProps {
  title: string
  updated: string
  children: ReactNode
}

export function LegalLayout({ title, updated, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border">
        <Container>
          <div className="flex h-16 items-center">
            <Link to="/">
              <Logo />
            </Link>
          </div>
        </Container>
      </header>

      <Container className="max-w-3xl pb-12 pt-4">
        <BackLink />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
        <p className="mt-2 text-sm text-text-secondary">Last updated: {updated}</p>

        <div className="mt-8 space-y-8">{children}</div>
      </Container>
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
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-text-secondary">{children}</div>
    </section>
  )
}

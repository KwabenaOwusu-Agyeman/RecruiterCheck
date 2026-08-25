import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Container } from '@/components/ui/Container'
import { GlowCard } from '@/components/ui/GlowCard'
import { EXAMPLE_DOCUMENTS } from '@/features/landing/data/exampleCheck'
import { useCheckCta } from '@/hooks/useCheckCta'
import { cn } from '@/utils/cn'

// Shared width for every document card in the scroller: narrow enough that
// three-plus cards read as a row rather than each one dominating the
// viewport, with the next card still peeking in past the edge.
const DOC_CARD_WIDTH = 'w-[86%] sm:w-[380px] lg:w-[400px] min-w-[260px] shrink-0 snap-start'

// Every card shows the same amount of the underlying one-page document —
// enough to read as a real resume/letter, not a full unclipped page that
// scrolls past the viewport. The fade-out at the bottom signals "preview
// of a longer document," the same convention DocSend/Notion previews use.
const PREVIEW_HEIGHT = 'h-[300px]'

function FadeOut() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-16 bg-gradient-to-t from-surface to-transparent"
    />
  )
}

function DraftBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue/10 px-2.5 py-1 text-xs font-semibold text-blue">
      Draft
    </span>
  )
}

// Matches drawBrandFooter in supabase/functions/generate-documents/index.ts —
// the same understated credit line every real Cover Letter and Recruiter
// Message PDF ships with (never on the CV, which stays ATS-safe and plain).
function BrandFooter() {
  return <p className="text-center text-[10px] text-text-secondary/60">Prepared with MyRecruiterCheck.com</p>
}

function CardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-auto border-t border-border-soft px-6 py-4 sm:px-10">
      {children}
    </div>
  )
}

/**
 * Mirrors the real one-page CV PDF layout (renderCvPdf/layoutCv in
 * supabase/functions/generate-documents/index.ts): centered blue name,
 * a single bullet-separated contact line, bold black section headings,
 * blue job/degree titles, bulleted experience, and the same diagonal
 * "DRAFT — NOT FOR SUBMISSION" watermark every real CV draft ships with.
 * Capped to a preview height with a fade-out, since the real document runs
 * a full page and this is a glance at it, not the whole thing.
 */
function CvDraftCard() {
  const { cvDraft } = EXAMPLE_DOCUMENTS
  return (
    <GlowCard className={DOC_CARD_WIDTH}>
      <Card tone="light-elevated" className="relative flex h-full flex-col overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
        >
          <span className="-rotate-[32deg] whitespace-nowrap text-2xl font-bold tracking-[0.2em] text-text-secondary/20 sm:text-3xl">
            DRAFT — NOT FOR SUBMISSION
          </span>
        </div>

        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-text-primary">Improved CV Draft</h3>
          </div>
          <DraftBadge />
        </CardHeader>
        <CardContent
          className={cn('relative overflow-hidden px-6 pt-6 text-center sm:px-10 sm:pt-8', PREVIEW_HEIGHT)}
        >
          <p className="font-display text-2xl font-bold tracking-tight text-blue sm:text-[28px]">
            {cvDraft.fullName}
          </p>
          <p className="mt-2 text-xs text-text-secondary sm:text-sm">{cvDraft.contactLine}</p>

          <div className="mt-6 text-left">
            <p className="text-base font-bold text-text-primary">{cvDraft.sectionLabels.summary}</p>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              {cvDraft.professionalSummary}
            </p>
          </div>

          <div className="mt-6 text-left">
            <p className="text-base font-bold text-text-primary">{cvDraft.sectionLabels.experience}</p>
            {cvDraft.experience.map((entry) => (
              <div key={`${entry.title}-${entry.companyLocation}`} className="mt-3">
                <p className="text-sm font-bold text-blue">{entry.title}</p>
                <p className="text-sm text-text-secondary">{entry.companyLocation}</p>
                <p className="text-sm text-text-secondary">{entry.dates}</p>
                <ul className="mt-1.5 space-y-1.5">
                  {entry.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2 text-sm leading-snug text-text-secondary">
                      <span aria-hidden="true">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-6 text-left">
            <p className="text-base font-bold text-text-primary">{cvDraft.sectionLabels.education}</p>
            {cvDraft.education.map((entry) => (
              <div key={entry.degree} className="mt-2">
                <p className="text-sm font-bold text-blue">{entry.degree}</p>
                <p className="text-sm text-text-secondary">{entry.institution}</p>
                <p className="text-sm text-text-secondary">{entry.dates}</p>
              </div>
            ))}
          </div>

          <FadeOut />
        </CardContent>

        <CardFooter>
          <p className="text-center text-[10px] text-text-secondary/60">One page draft, ready to edit</p>
        </CardFooter>
      </Card>
    </GlowCard>
  )
}

// Matches formatLetterDate in supabase/functions/generate-documents/index.ts
// exactly, so the preview always shows today's date like the real PDF does.
function formatLetterDate(): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
}

/**
 * Mirrors the real one-page cover letter layout (layoutCoverLetter/
 * renderCoverLetterPdf): letterhead, right-aligned date, company/location
 * block, salutation, intro paragraph, exactly 3 body paragraphs, a
 * conclusion, and a separate thank-you line before the sign-off — capped to
 * a preview height with a fade-out rather than the full letter.
 */
function CoverLetterCard() {
  const { coverLetter, candidateName, cvDraft } = EXAMPLE_DOCUMENTS
  return (
    <GlowCard className={DOC_CARD_WIDTH}>
      <Card tone="light-elevated" className="flex h-full flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-text-primary">Cover Letter</h3>
          </div>
          <DraftBadge />
        </CardHeader>
        <CardContent className={cn('relative overflow-hidden px-6 pt-6 sm:px-10 sm:pt-8', PREVIEW_HEIGHT)}>
          <div className="text-center">
            <p className="font-display text-lg font-bold tracking-tight text-blue">{cvDraft.fullName}</p>
            <p className="mt-1 text-xs text-text-secondary">{cvDraft.contactLine}</p>
          </div>

          <div className="mt-6 flex items-start justify-between gap-4 text-sm text-text-secondary">
            <p>{coverLetter.companyLocation}</p>
            <p className="shrink-0">{formatLetterDate()}</p>
          </div>

          <p className="mt-4 text-sm font-semibold text-text-primary">{coverLetter.salutation}</p>

          <div className="mt-3 space-y-3">
            <p className="text-sm leading-relaxed text-text-secondary">{coverLetter.introParagraph}</p>
            {coverLetter.bodyParagraphs.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-relaxed text-text-secondary">
                {paragraph}
              </p>
            ))}
            <p className="text-sm leading-relaxed text-text-secondary">{coverLetter.conclusionParagraph}</p>
            <p className="text-sm leading-relaxed text-text-secondary">{coverLetter.thankYouLine}</p>
          </div>

          <p className="mt-4 text-sm font-semibold text-text-primary">{coverLetter.closingPhrase}</p>
          <p className="text-sm font-semibold text-text-primary">{candidateName}</p>

          <FadeOut />
        </CardContent>

        <CardFooter>
          <BrandFooter />
        </CardFooter>
      </Card>
    </GlowCard>
  )
}

/**
 * Mirrors what renderRecruiterEmailPdf actually produces (see
 * supabase/functions/generate-documents/index.ts): plain greeting, body,
 * closing line, and signature — meant to be pasted into LinkedIn or an
 * email the candidate sends themselves. Same static-preview treatment as
 * the other two cards here (no functional button) since this is example
 * copy, not a real generated message there's anything to act on yet.
 */
function RecruiterMessageCard() {
  const { recruiterMessage } = EXAMPLE_DOCUMENTS

  return (
    <GlowCard className={DOC_CARD_WIDTH}>
      <Card tone="light-elevated" className="flex h-full flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-text-primary">Recruiter Message</h3>
          </div>
          <DraftBadge />
        </CardHeader>
        <CardContent className={cn('relative overflow-hidden px-6 pt-6 sm:px-10 sm:pt-8', PREVIEW_HEIGHT)}>
          <p className="text-xs text-text-secondary">Ready to paste into LinkedIn or an email.</p>
          <div className="mt-4 space-y-3">
            {recruiterMessage.body.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-relaxed text-text-secondary">
                {paragraph}
              </p>
            ))}
          </div>
          <p className="mt-4 whitespace-pre-line text-sm font-semibold text-text-primary">
            {recruiterMessage.signOff}
          </p>

          <FadeOut />
        </CardContent>

        <CardFooter>
          <BrandFooter />
        </CardFooter>
      </Card>
    </GlowCard>
  )
}

export function DocumentShowcase() {
  const handleCheckCta = useCheckCta()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  // The row's own left padding (pl-[16px], larger at sm/lg) means the
  // resting scroll-snap position for the first card isn't exactly 0, and
  // the trailing spacer does the same at the end — so bounds are checked
  // against a tolerance wide enough to absorb that padding, not just 1px.
  const SCROLL_BOUNDS_TOLERANCE = 24

  function updateScrollBounds() {
    const el = scrollerRef.current
    if (!el) return
    setAtStart(el.scrollLeft <= SCROLL_BOUNDS_TOLERANCE)
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - SCROLL_BOUNDS_TOLERANCE)
  }

  useEffect(() => {
    updateScrollBounds()
  }, [])

  function scrollByCard(direction: 1 | -1) {
    const el = scrollerRef.current
    if (!el) return
    if (direction === -1 && atStart) return
    if (direction === 1 && atEnd) return
    const cardWidth = el.firstElementChild?.getBoundingClientRect().width ?? el.clientWidth * 0.72
    el.scrollBy({ left: direction * (cardWidth + 20), behavior: 'smooth' })
  }

  return (
    <section className="overflow-hidden border-b border-border bg-background py-[32px] sm:py-12 lg:py-[64px]">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-[20px] font-semibold tracking-tight text-text-primary sm:text-3xl">
            From feedback to finished documents
          </h2>
          <p className="mt-3 text-[14px] text-text-secondary sm:text-base">
            See the documents your check can write: an improved CV, a cover letter, and a ready to send
            message.
          </p>
          <p className="mt-3 text-xs font-medium text-text-secondary sm:hidden">
            Swipe or use the arrows to see all three &rarr;
          </p>
          {/* Desktop only — mobile already has the global sticky "Check" CTA,
              so a second one here would just duplicate it. */}
          <div className="mt-6 hidden justify-center sm:flex">
            <Button size="md" onClick={handleCheckCta}>
              Check My Application
            </Button>
          </div>
        </div>
      </Container>

      {/* Deliberately outside Container: the row bleeds past the right edge
          of the viewport (like monday.com's product carousel) instead of
          being boxed in by the page's max-width, so the peek reads as a
          real scrollable row rather than content cut off inside a border. */}
      <div className="relative mt-5 sm:mt-6">
        <div
          ref={scrollerRef}
          onScroll={updateScrollBounds}
          className="flex snap-x snap-mandatory gap-5 overflow-x-auto overscroll-x-contain pl-[16px] pb-2 [scrollbar-width:none] sm:pl-6 lg:pl-8 [&::-webkit-scrollbar]:hidden"
        >
          <CvDraftCard />
          <CoverLetterCard />
          <RecruiterMessageCard />
          <div className="w-[16px] shrink-0 sm:w-6 lg:w-8" aria-hidden="true" />
        </div>

        {/* One shared set of controls, floating at the footer's vertical
            position (not mid-card) so it never sits over card body text.
            Fixed to the row itself, not per-card — desktop shows all three
            cards at once and has nothing to scroll between. Disabled once
            the scroller hits the first/last document so pressing an arrow
            can never scroll past the ends. */}
        <button
          type="button"
          aria-label="Show previous document"
          onClick={() => scrollByCard(-1)}
          disabled={atStart}
          className="absolute bottom-[13px] left-2 flex h-8 w-8 items-center justify-center rounded-full border border-border-strong bg-surface text-text-primary shadow-card disabled:pointer-events-none disabled:opacity-40 sm:hidden"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Show next document"
          onClick={() => scrollByCard(1)}
          disabled={atEnd}
          className="absolute bottom-[13px] right-2 flex h-8 w-8 items-center justify-center rounded-full border border-border-strong bg-surface text-text-primary shadow-card disabled:pointer-events-none disabled:opacity-40 sm:hidden"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}

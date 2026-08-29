import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { SectionCta } from '@/features/landing/components/SectionCta'
import { GlowCard } from '@/components/ui/GlowCard'
import { ScoreBadge, StatusBadge } from '@/components/ui/Badge'
import { ROLE_EXAMPLES } from '@/features/landing/data/exampleCheck'
import { cn } from '@/utils/cn'

type TabId = 'empty' | 'new' | 'checks'

const TABS: { id: TabId; label: string }[] = [
  { id: 'empty', label: 'Before' },
  { id: 'new', label: 'Add' },
  { id: 'checks', label: 'Track' },
]

// Reuses the first three of the same five roles as RoleFeedbackShowcase, so
// the score shown here for e.g. "Software Engineer at Lumen Cloud" is the
// same 88% shown there — one consistent example dataset across the whole
// landing page. Capped to 3 rows (not all 5) so this preview stays compact,
// and mixes in a draft (no score yet) so the list doesn't read as if every
// check finishes instantly.
const MOCK_STATUSES: ('completed' | 'draft')[] = ['completed', 'draft', 'completed']
// No company names in the rows. The employers in ROLE_EXAMPLES are
// invented, and an invented company on a public surface reads at a glance
// like a real one this product is associated with — the same reason the
// verdict card and the cover letter carry none. The experience level is
// the more useful second line here anyway: it is what distinguishes two
// checks for the same role.
const MOCK_CHECKS = ROLE_EXAMPLES.slice(0, 3).map((example, index) => ({
  jobTitle: example.role,
  experience: example.experience,
  status: MOCK_STATUSES[index],
  score: MOCK_STATUSES[index] === 'completed' ? example.score : null,
  daysAgo: [1, 2, 4][index],
}))

function relativeDate(daysAgo: number): string {
  if (daysAgo === 1) return '1 day ago'
  return `${daysAgo} days ago`
}

function BrowserChrome({ children }: { children: ReactNode }) {
  return (
    <GlowCard>
      <div className="overflow-hidden rounded-[20px] border border-border-soft bg-surface shadow-elevated">
        <div className="flex items-center gap-2 border-b border-border-soft bg-background px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" aria-hidden="true" />
          <span className="ml-3 rounded-full bg-surface px-3 py-1 text-xs text-text-secondary">
            myrecruitercheck.com/checks
          </span>
        </div>
        <div className="min-h-[380px] p-5 sm:min-h-[400px] sm:p-6">{children}</div>
      </div>
    </GlowCard>
  )
}

function EmptyStateMock() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <h3 className="text-base font-semibold text-text-primary">No checks yet</h3>
      <p className="mt-2 max-w-xs text-sm text-text-secondary">
        Add a job and your CV to see your application from a recruiter's perspective.
      </p>
      <Link to="/checks/new" className="mt-5">
        <Button size="sm">New Check</Button>
      </Link>
    </div>
  )
}

function NewCheckMock() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Job description
          </p>
          <div className="inline-flex shrink-0 rounded-full border border-border-soft bg-background p-0.5 text-xs font-medium">
            <span className="rounded-full bg-blue px-3 py-1 text-white">Paste</span>
            <span className="px-3 py-1 text-text-secondary">URL</span>
            <span className="px-3 py-1 text-text-secondary">Upload</span>
          </div>
        </div>
        <div className="rounded-[14px] border border-border-soft bg-background px-4 py-3 text-sm leading-relaxed text-text-secondary">
          We're looking for a Software Engineer with experience in distributed systems and
          production scale APIs to join our platform team...
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">CV</p>
        <div className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-border-strong bg-background px-4 py-5 text-center">
          <Upload className="h-[20px] w-[20px] text-text-secondary" aria-hidden="true" />
          <p className="text-sm font-medium text-text-primary">cv.pdf</p>
          <p className="text-xs text-text-secondary">PDF or DOCX &middot; Uploaded</p>
        </div>
      </div>

      <div className="flex justify-end border-t border-border pt-5">
        <Button size="sm" className="pointer-events-none">Check</Button>
      </div>
    </div>
  )
}

function ChecksListMock() {
  return (
    <div className="space-y-2">
      {MOCK_CHECKS.map((check) => (
        <div
          key={check.jobTitle}
          className="flex items-center justify-between gap-3 rounded-[14px] border border-border-soft px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">{check.jobTitle}</p>
            <p className="truncate text-sm text-text-secondary">{check.experience}</p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <StatusBadge status={check.status} className="hidden w-[104px] justify-center sm:inline-flex" />
            <ScoreBadge score={check.score} />
            <span className="hidden w-20 shrink-0 text-right text-xs text-text-secondary sm:block">
              {relativeDate(check.daysAgo)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

const TAB_DURATION_MS = 4500

// Cursor resting point over each tab: centre of column 1, 2, 3. Literal
// classes (not built from the index) so the build-time scanner finds them;
// the glide between them is a plain CSS left/transform transition driven by
// the same activeTab state as the tabs themselves, so pausing on hover
// pauses the cursor too and the two can never drift apart.
const CURSOR_LEFT_CLASS: Record<number, string> = {
  0: 'left-[16.6%]',
  1: 'left-[50%]',
  2: 'left-[83.3%]',
}

export function DashboardShowcase() {
  const [activeTab, setActiveTab] = useState<TabId>('empty')
  const [paused, setPaused] = useState(false)

  // Linear/Vercel-style self-playing tabs: each tab's progress bar fills on
  // its own, advancing to the next tab when it completes, so the section
  // shows itself off without needing a click — paused on hover so it never
  // fights a visitor who's actually reading the current view.
  useEffect(() => {
    if (paused) return
    const timer = setTimeout(() => {
      const index = TABS.findIndex((tab) => tab.id === activeTab)
      setActiveTab(TABS[(index + 1) % TABS.length].id)
    }, TAB_DURATION_MS)
    return () => clearTimeout(timer)
  }, [activeTab, paused])

  return (
    <section className="border-b border-border bg-background">
      <Container className="py-[56px] sm:py-16 lg:py-[112px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue sm:text-sm">
            Your dashboard
          </p>
          <h2 className="mt-2 font-display text-[24px] text-text-primary sm:text-[32px] lg:text-[44px] lg:leading-[1.14]">
            Every application, tracked in one place
          </h2>
          <p className="mt-3 text-base text-text-secondary sm:text-lg">
            Add a job in seconds, and keep every score and check you've run within easy reach.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Dashboard view"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          className="relative mx-auto mt-5 grid max-w-full grid-cols-3 gap-2 sm:mt-6 sm:gap-6 lg:max-w-[560px]"
        >
          {/* The implied hand: a cursor that glides to whichever tab the
              self-playing cycle activates. Desktop only, decorative, and
              positioned by state rather than its own clock so it stays in
              step when the cycle pauses on hover. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={cn(
              'pointer-events-none absolute -bottom-6 z-10 hidden h-[20px] w-[20px] -translate-x-1/2 fill-navy stroke-white transition-[left] duration-700 ease-out lg:block',
              CURSOR_LEFT_CLASS[TABS.findIndex((tab) => tab.id === activeTab)] ?? CURSOR_LEFT_CLASS[0],
            )}
          >
            <path d="M5.5 3.5 19 12l-6.2 1.4L9.5 19z" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className="group flex flex-col items-center gap-2 pt-2 text-center"
              >
                <span
                  className={cn(
                    'text-xs font-semibold transition-colors duration-200 sm:text-sm',
                    isActive ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary',
                  )}
                >
                  {tab.label}
                </span>
                <span className="h-[3px] w-full overflow-hidden rounded-full bg-border-soft">
                  {isActive ? (
                    <span
                      key={tab.id}
                      className={cn(
                        'block h-full w-full origin-left rounded-full bg-blue animate-fill-bar',
                        paused && '[animation-play-state:paused]',
                      )}
                    />
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>

        <div className="relative mx-auto mt-5 max-w-2xl sm:mt-6 lg:max-w-[560px]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-12 -bottom-8 -top-10 rounded-[40px] bg-[radial-gradient(ellipse_70%_60%_at_50%_45%,rgba(25,74,159,0.09),transparent_70%)]"
          />
          <div
            aria-hidden="true"
            className="absolute -right-9 top-16 z-10 hidden animate-float-slow items-center gap-2 rounded-full border border-border-soft bg-surface py-2 pl-3 pr-4 shadow-elevated [animation-delay:0.8s] lg:flex"
          >
            <span className="h-[8px] w-[8px] rounded-full bg-success" />
            <span className="text-sm font-semibold text-text-primary">85%</span>
            <span className="text-sm text-text-secondary">Software Engineer</span>
          </div>
          <BrowserChrome>
            {/* All three panels are mounted in the SAME grid cell, so the box
                is always as tall as the tallest of them and the section's
                height never changes as the tabs cycle.

                Previously only the active panel was mounted. "Track" is much
                taller than "Before" and "Add", so every cycle grew and shrank
                this section by ~290px, which shoved everything below it —
                including the reviews — up and down on a loop. That read as
                the page shaking whenever you stopped near the reviews.

                Crossfade is an opacity transition rather than the fade-in
                keyframe, because a keyframe only replays on remount and these
                panels now stay mounted. Both are plain CSS classes, so
                neither needs the inline styles the CSP's style-src blocks. */}
            <div className="grid">
              {TABS.map((tab) => {
                const isActive = tab.id === activeTab
                return (
                  <div
                    key={tab.id}
                    aria-hidden={!isActive}
                    className={cn(
                      'col-start-1 row-start-1 transition-opacity duration-300',
                      isActive ? 'opacity-100' : 'pointer-events-none opacity-0',
                    )}
                  >
                    {tab.id === 'empty' ? (
                      <EmptyStateMock />
                    ) : tab.id === 'new' ? (
                      <NewCheckMock />
                    ) : (
                      <ChecksListMock />
                    )}
                  </div>
                )
              })}
            </div>
          </BrowserChrome>
        </div>

        <SectionCta secondaryTo="/application-checker" secondaryLabel="What a full check covers" />
      </Container>
    </section>
  )
}

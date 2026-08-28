import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
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
const MOCK_CHECKS = ROLE_EXAMPLES.slice(0, 3).map((example, index) => ({
  jobTitle: example.role,
  companyName: example.companyName,
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
          <Upload className="h-5 w-5 text-text-secondary" aria-hidden="true" />
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
            <p className="truncate text-sm text-text-secondary">{check.companyName}</p>
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
      <Container className="py-[32px] sm:py-12 lg:py-[64px]">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-[20px] font-semibold tracking-tight text-text-primary sm:text-3xl">
            Every application, tracked in one place
          </h2>
          <p className="mt-3 text-[14px] text-text-secondary sm:text-base">
            Add a job in seconds, and keep every score and check you've run within easy reach.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Dashboard view"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          className="mx-auto mt-5 grid max-w-full grid-cols-3 gap-2 sm:mt-6 sm:gap-6 lg:max-w-[560px]"
        >
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

        <div className="mx-auto mt-5 max-w-2xl sm:mt-6 lg:max-w-[560px]">
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
      </Container>
    </section>
  )
}

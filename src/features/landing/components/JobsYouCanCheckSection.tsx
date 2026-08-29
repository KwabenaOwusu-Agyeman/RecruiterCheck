import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useCheckCta } from '@/hooks/useCheckCta'
import { cn } from '@/utils/cn'
import { prefersReducedMotion } from '@/utils/prefersReducedMotion'

/**
 * Illustrative examples of the roles a Recruiter Check covers, not a feed of
 * real checks. The point is recognition: a visitor should spot their own job
 * title here and understand the product applies to them — which is why the
 * roles now arrive as a stacked trio that holds still long enough to read,
 * rather than a marquee drifting past the reading axis. Every three seconds
 * the next three cascade in (the DashboardShowcase self-playing pattern:
 * state timer, keyed remount replays the compiled keyframes, paused on
 * hover, inert under reduced motion).
 *
 * The navy card is the page's one deliberately colourful moment: variety is
 * this section's whole message, which is what earns the pastel chips (the
 * monday.com chip-row logic) while the rest of the page keeps its
 * single-accent discipline. The pastels are section-local on purpose —
 * decorative variety, not semantic colour. The page ground stays cream; the
 * navy is an object on it, bookending the closing card.
 *
 * Deliberately no company names anywhere on this section.
 */
const ROLES = [
  'Data Analyst, Entry Level',
  'AI Engineer',
  'Graduate Software Engineer',
  'Junior Data Scientist',
  'Machine Learning Engineer',
  'Backend Engineer',
  'Data Engineer',
  'MLOps Engineer',
  'QA Test Engineer',
  'Analytics Engineer',
]

const CHIP_TINTS = [
  'bg-[#8FB2F0]', // the palette's own blue-light
  'bg-[#B9E6C9]', // mint
  'bg-[#FBD9A6]', // peach
  'bg-[#DCD3F7]', // lavender
]

// Literal classes (not built from the index) so the build-time scanner
// generates them: the cascade stagger and a hair of alternating tilt, which
// makes the trio read as scattered tags rather than a list.
const CHIP_DELAY = ['[animation-delay:0ms]', '[animation-delay:120ms]', '[animation-delay:240ms]']
const CHIP_TILT = ['-rotate-1', 'rotate-[0.75deg]', '-rotate-[0.75deg]']

const GROUP_DURATION_MS = 3000
const GROUP_SIZE = 3

export function JobsYouCanCheckSection() {
  const handleCheckCta = useCheckCta()
  const [group, setGroup] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = prefersReducedMotion()

  useEffect(() => {
    if (paused || reduced) return
    const timer = setTimeout(() => setGroup((current) => current + 1), GROUP_DURATION_MS)
    return () => clearTimeout(timer)
  }, [group, paused, reduced])

  // A sliding window over the whole list, stepping by three: every role
  // appears, and the tint index keeps moving so each trio wears a different
  // colour order than the last.
  const visible = Array.from({ length: GROUP_SIZE }, (_, i) => {
    const roleIndex = (group * GROUP_SIZE + i) % ROLES.length
    return { role: ROLES[roleIndex], tint: CHIP_TINTS[roleIndex % CHIP_TINTS.length] }
  })

  return (
    <section className="border-b border-border bg-background">
      <Container className="py-[48px] sm:py-14 lg:py-[80px]">
        <div className="relative overflow-hidden rounded-[20px] bg-navy px-5 py-9 shadow-elevated sm:px-8 sm:py-11 lg:py-[52px]">
          {/* The hero's quiet texture family: dot grid and a soft light wash,
              the same layers the closing card carries. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.09)_1px,transparent_1px)] bg-[length:26px_26px] [mask-image:radial-gradient(ellipse_65%_70%_at_50%_20%,black_0%,transparent_75%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[-30%] h-[280px] w-[620px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(143,178,240,0.20),transparent_70%)]"
          />

          <div className="relative mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-light sm:text-sm">
              Jobs we check
            </p>
            <h2 className="mt-2 font-display text-[24px] text-white sm:text-[32px] lg:text-[44px] lg:leading-[1.14]">
              Jobs you can check
            </h2>
            <p className="mt-3 text-base text-white/75 sm:text-lg">
              AI, data and tech roles, from your first internship to five years in.
            </p>
          </div>

          {/* Fixed height so a longer title in one trio never resizes the
              card; keyed by group so the cascade replays each cycle. */}
          <div
            className="relative mx-auto mt-7 flex h-[156px] flex-col items-center justify-center gap-2.5 sm:mt-8 sm:h-[168px] sm:gap-3"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            key={reduced ? 'static' : group}
          >
            {visible.map(({ role, tint }, index) => (
              <span
                key={role}
                className={cn(
                  'flex h-10 w-fit items-center whitespace-nowrap rounded-full px-5 text-sm font-semibold text-navy sm:h-11 sm:px-6 sm:text-[15px]',
                  tint,
                  CHIP_TILT[index],
                  !reduced && 'animate-row-fade-in-up',
                  !reduced && CHIP_DELAY[index],
                )}
              >
                {role}
              </span>
            ))}
          </div>

          <div className="relative mt-7 flex flex-col items-center justify-center gap-3 sm:mt-9 sm:flex-row sm:gap-5">
            <Button variant="light" size="md" onClick={handleCheckCta} className="hidden sm:inline-flex">
              Check My Application
            </Button>
            <Link
              to="/free-cv-checker"
              className="text-base font-medium text-blue-light underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              Try the free CV checker
            </Link>
          </div>
        </div>
      </Container>
    </section>
  )
}

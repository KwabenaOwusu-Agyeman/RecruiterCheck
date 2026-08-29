import { Container } from '@/components/ui/Container'
import { TIER_LABEL } from '@/components/feedback/ScoreLockup'
import { SectionCta } from '@/features/landing/components/SectionCta'
import { cn } from '@/utils/cn'

/**
 * One cohesive comparison surface, not a checkmark matrix. The old design
 * scored ChatGPT vs MyRecruiterCheck as a five-row yes/no grid, which reads
 * as a generic SaaS feature table and hides the actual argument: ChatGPT
 * can do this work when prompted well, MyRecruiterCheck productises the
 * prompting itself. So every row here is a short before/after pair, not a
 * verdict icon, and the row we concede (Unlimited Chat) is styled exactly
 * as quietly as the rows that go our way — an honest concession is what
 * makes the other three believable.
 *
 * MyRecruiterCheck carries the stronger visual hierarchy (navy column
 * heading, semibold navy body text) while ChatGPT stays neutral, matching
 * how the rest of the landing page treats the product vs. the alternative.
 * No icons, no colour-coded win/lose treatment: the CLEAR VERDICT row reuses
 * the product's own Interview Score typography (Fraunces numeral, the exact
 * semantic "Needs Improvement" pill token) as the one visual peak, never the
 * internal scoring weights.
 */
interface ComparisonRow {
  number: string
  label: string
  chatgpt: string
  /** false for the one row ChatGPT wins — kept typographically equal, not styled as a loss. */
  mrcEmphasis: boolean
  mrc: string
}

const ROWS: ComparisonRow[] = [
  { number: '01', label: 'Ready to use', chatgpt: 'You decide what to ask', mrcEmphasis: true, mrc: "CV + job. That's it." },
  { number: '02', label: 'Consistent check', chatgpt: 'Depends on your instructions', mrcEmphasis: true, mrc: 'Same recruiter framework every time' },
  { number: '03', label: 'Clear verdict', chatgpt: 'Open ended feedback', mrcEmphasis: true, mrc: '' },
  { number: '04', label: 'Unlimited chat', chatgpt: 'Yes', mrcEmphasis: false, mrc: 'No' },
]

/**
 * The compact score example for the Clear Verdict row. Deliberately not the
 * full ScoreLockup: no gauge, no framework row, nothing beyond the numeral,
 * the verdict pill, and one caption naming what they are. A proof point, not
 * a second dashboard — and the score alone, never the weights behind it.
 */
function VerdictExample() {
  return (
    <div>
      <p className="font-display text-[34px] font-semibold leading-none tracking-[-0.02em] text-navy [font-variant-numeric:tabular-nums] sm:text-[38px]">
        76%
      </p>
      <p className="mt-[10px]">
        <span className="inline-flex items-center gap-[6px] rounded-full bg-warning/15 px-[10px] py-[4px] text-[12px] font-semibold leading-none text-warning-deep">
          <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-current" aria-hidden="true" />
          {TIER_LABEL.improve}
        </span>
      </p>
      <p className="mt-[10px] text-xs font-medium text-text-caption">Interview Score &middot; Recruiter Verdict</p>
    </div>
  )
}

export function LlmComparisonSection() {
  return (
    <section className="border-b border-border bg-background">
      <Container className="py-[48px] sm:py-[64px] lg:py-[88px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue sm:text-sm">
            Why not just use ChatGPT?
          </p>
          <h2 className="mt-3 text-balance font-display text-[22px] leading-[1.3] text-text-secondary sm:text-[28px] lg:text-[36px] lg:leading-[1.25]">
            You could build the prompt yourself.
            <br className="hidden sm:block" />{' '}
            <span className="font-semibold text-navy">We built the application check for you.</span>
          </h2>
        </div>

        <div className="mx-auto mt-8 max-w-[940px] overflow-hidden rounded-[20px] border border-border-soft bg-surface shadow-card sm:mt-9">
          {/* Column headings, once, above the rows — below lg every row
              carries its own inline labels instead (see the per-cell
              headings), so the surface never repeats itself as a table. */}
          <div className="hidden border-b border-border-soft px-8 py-3 lg:grid lg:grid-cols-[180px_1fr_1fr] lg:gap-x-10">
            <span aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-caption">ChatGPT</span>
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-navy">MyRecruiterCheck</span>
          </div>

          {ROWS.map((row, index) => (
            <div
              key={row.number}
              className={cn(
                'grid grid-cols-1 gap-x-10 gap-y-3 px-5 py-5 sm:px-7 sm:py-6 lg:grid-cols-[180px_1fr_1fr] lg:items-center lg:px-8 lg:py-7',
                index > 0 && 'border-t border-border-soft',
              )}
            >
              <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-text-primary sm:text-[13px]">
                <span className="text-text-caption">{row.number}</span>
                <span aria-hidden="true"> &middot; </span>
                {row.label}
              </p>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-caption lg:hidden">
                  ChatGPT
                </p>
                <p className="mt-[4px] text-[15px] leading-snug text-text-secondary sm:text-base lg:mt-0">
                  {row.chatgpt}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-navy lg:hidden">
                  MyRecruiterCheck
                </p>
                <div className="mt-[4px] lg:mt-0">
                  {row.mrc === '' ? (
                    <VerdictExample />
                  ) : (
                    <p
                      className={cn(
                        'text-[15px] leading-snug sm:text-base',
                        row.mrcEmphasis ? 'font-semibold text-navy' : 'text-text-secondary',
                      )}
                    >
                      {row.mrc}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <SectionCta
          secondaryTo="/myrecruitercheck-vs-chatgpt"
          secondaryLabel="See the full comparison"
          primary={false}
        />
      </Container>
    </section>
  )
}

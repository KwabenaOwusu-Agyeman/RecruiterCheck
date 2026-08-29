import { Link } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { TIER_LABEL } from '@/components/feedback/ScoreLockup'
import { cn } from '@/utils/cn'

/**
 * One cohesive comparison surface, not a checkmark matrix. The old design
 * scored ChatGPT vs MyRecruiterCheck as a yes/no grid, which reads as a
 * generic SaaS feature table and hides the actual argument: ChatGPT can do
 * this work when prompted well, MyRecruiterCheck productises the prompting
 * itself. So every row is a short before/after pair, not a verdict icon, and
 * the row we concede (Unlimited Chat) is styled exactly as quietly as the
 * rows that go our way — an honest concession is what makes the others
 * believable.
 *
 * Colour does the differentiating, in three tiers: the criteria rail is
 * neutral cream, ChatGPT is pure white + pure black (its own identity,
 * stated plainly rather than caricatured), and MyRecruiterCheck is deep navy
 * + pure white. Both product columns run at full contrast — nothing is
 * dimmed to make the other side look better. The single exception is the
 * amber verdict pill, which keeps the product's semantic tier colour.
 *
 * Casing follows what a thing IS: structural labels are uppercase with
 * tracking ("WHAT YOU GET", "READY TO USE"), product names keep their real
 * casing ("ChatGPT", "MyRecruiterCheck"), because a brand name rendered in
 * all caps reads as shouting rather than as a label.
 *
 * The navy column is ONE continuous surface from md up, not a navy card per
 * row: each row wrapper is `md:contents`, so its three cells become direct
 * children of the outer grid and the column backgrounds run edge to edge
 * from the header down through every row, broken only by hairlines.
 *
 * DENSITY IS THE POINT HERE. Every vertical value is an explicit pixel, for
 * two reasons: this repo overrides Tailwind's spacing scale for 1-10 (`py-4`
 * is 2rem, not 1rem — see the inverted-padding fix in 0eeae7e), so scale
 * classes silently double the intended gap; and the section is deliberately
 * tighter than the page's standard 48/64/88 section rhythm, because four
 * one-line answers do not earn hero spacing. The simple rows are sized to
 * their text; only CLEAR VERDICT is taller, and only because it carries the
 * score.
 *
 * The CLEAR VERDICT row reuses the product's own Interview Score typography
 * (Fraunces numeral) and the exact semantic "Needs Improvement" pill for
 * dark grounds. It never shows the internal scoring weights.
 */
interface ComparisonRow {
  label: string
  chatgpt: string
  /**
   * Empty string renders the Interview Score example instead of a sentence.
   * Note there is no de-emphasis flag: the row ChatGPT wins is set in the
   * same white and the same weight as the three that go our way. Conceding
   * quietly would look like hiding it — stating "NO" as plainly as
   * "CV + job. That's it." is what makes the other three credible.
   */
  mrc: string
}

const ROWS: ComparisonRow[] = [
  { label: 'Ready to use', chatgpt: 'You decide what to ask', mrc: "CV + job. That's it." },
  { label: 'Consistent check', chatgpt: 'Depends on your instructions', mrc: 'Same recruiter framework every time' },
  { label: 'Clear verdict', chatgpt: 'Open ended response', mrc: '' },
  { label: 'Unlimited chat', chatgpt: 'YES', mrc: 'NO' },
]

// Column padding in one place so the three columns stay on one baseline
// grid. Tight everywhere: the colour blocks already separate the rows, so
// padding must not also do that job.
const VALUE_CELL = 'px-[16px] py-[9px] sm:px-[20px] md:flex md:flex-col md:justify-center md:px-[24px] md:py-[15px]'
const LABEL_CELL = 'bg-background px-[16px] py-[7px] sm:px-[20px] md:flex md:flex-col md:justify-center md:px-[24px] md:py-[15px]'
const HEADING_CELL = 'hidden md:block md:border-b md:px-[24px] md:py-[12px]'
// The two products are what the reader is comparing, so they carry the
// column heading weight. "What you get" is a structural label for the rail
// beneath it, not a third competitor — smaller, and in the secondary ink so
// it recedes behind the two names without losing legibility.
const HEADING_PRODUCT = 'font-bold leading-tight md:text-[17px] lg:text-[19px]'
const HEADING_STRUCTURAL = 'font-bold uppercase leading-tight tracking-[0.08em] text-text-secondary md:text-[13px] lg:text-[14px]'
// The repeated per-row column labels on the stacked layout — same names as
// the desktop headers, small enough to stay out of the answer's way.
const STACK_LABEL = 'text-[11px] font-bold tracking-[0.02em] md:hidden'

/**
 * The compact score example for the Clear Verdict row, on the navy column.
 * Deliberately not the full ScoreLockup: no gauge, no framework row, nothing
 * beyond the numeral, the verdict pill and one caption naming what they are.
 * A proof point, not a second dashboard — and the score alone, never the
 * weights behind it. The pill is the existing dark-ground "improve" tone
 * (white/10 fill, amber text) from ScoreLockup, which measures 6.95:1 here,
 * and is the one piece of non-white text in this column: it is carrying a
 * semantic tier, not just emphasis.
 *
 * The caption says what the number MEANS, because "Interview Score" alone
 * is ambiguous to someone meeting it for the first time — it can be read as
 * interview performance, as a probability of being invited, or as a generic
 * CV rating. "How your CV matches this job" rules all three out and names
 * the actual claim. It does not say "Recruiter Verdict": the amber tier pill
 * above already is the verdict, so labelling it again was copy without
 * information.
 */
function VerdictExample() {
  return (
    <div>
      <p className="font-display text-[28px] font-semibold leading-none tracking-[-0.02em] text-white [font-variant-numeric:tabular-nums] sm:text-[32px]">
        76%
      </p>
      <p className="mt-[7px]">
        <span className="inline-flex items-center gap-[6px] rounded-full bg-white/10 px-[9px] py-[3px] text-[11px] font-semibold uppercase leading-none tracking-[0.04em] text-warning">
          <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-current" aria-hidden="true" />
          {TIER_LABEL.improve}
        </span>
      </p>
      <p className="mt-[6px] text-[12px] font-semibold leading-tight text-white">Interview Score</p>
      <p className="mt-[1px] text-[11px] leading-tight text-white">How your CV matches this job</p>
    </div>
  )
}

export function LlmComparisonSection() {
  return (
    <section className="border-b border-border bg-background">
      <Container className="pb-[36px] pt-[22px] sm:pb-[44px] sm:pt-[28px] lg:pb-[64px] lg:pt-[40px]">
        {/* The landing page's standard section header: the same eyebrow
            treatment and heading scale every other section uses (see
            DocumentShowcase / HowItWorksSection), so this section reads as
            part of the page rather than as its own poster. The eyebrow
            carries the specialisation claim, the heading names the
            comparison. No pill or badge — hierarchy is size and colour. */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-balance text-xs font-semibold uppercase tracking-[0.18em] text-blue sm:text-sm">
            Built specifically for AI, data and tech
          </p>
          <h2 className="mt-2 font-display text-[24px] text-navy sm:text-[32px] lg:text-[44px] lg:leading-[1.14]">
            Us vs ChatGPT
          </h2>
        </div>

        <div className="mx-auto mt-[14px] max-w-[940px] overflow-hidden rounded-[16px] border border-border-soft shadow-card sm:mt-[16px] md:grid md:grid-cols-[180px_1fr_1fr] lg:mt-[18px] lg:grid-cols-[220px_1fr_1fr]">
          {/* Column headings, once, at the top of each column. Below md every
              value carries its own inline label instead, since the columns
              stack there and one header row could not reach them. */}
          <div className={cn(HEADING_CELL, HEADING_STRUCTURAL, 'bg-background md:border-border')}>
            What you get
          </div>
          <div className={cn(HEADING_CELL, HEADING_PRODUCT, 'bg-white text-black md:border-black/10')}>
            ChatGPT
          </div>
          <div className={cn(HEADING_CELL, HEADING_PRODUCT, 'bg-navy text-white md:border-white/10')}>
            MyRecruiterCheck
          </div>

          {ROWS.map((row, index) => {
            const divider = index > 0
            return (
              // md:contents dissolves this wrapper into the outer grid, so
              // the three cells below become direct grid items and each
              // column's background runs unbroken down the component.
              <div key={row.label} className="md:contents">
                <div className={cn(LABEL_CELL, divider && 'border-t border-border')}>
                  <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-navy sm:text-[13px]">
                    {row.label}
                  </p>
                </div>

                <div className={cn('bg-white', VALUE_CELL, divider && 'md:border-t md:border-black/10')}>
                  <p className={cn(STACK_LABEL, 'text-black')}>ChatGPT</p>
                  <p className="mt-[2px] text-[15px] leading-snug text-black sm:text-base md:mt-0">
                    {row.chatgpt}
                  </p>
                </div>

                <div className={cn('bg-navy', VALUE_CELL, divider && 'md:border-t md:border-white/10')}>
                  <p className={cn(STACK_LABEL, 'text-white')}>MyRecruiterCheck</p>
                  <div className="mt-[2px] md:mt-0">
                    {row.mrc === '' ? (
                      <VerdictExample />
                    ) : (
                      <p className="text-[15px] font-semibold leading-snug text-white sm:text-base">
                        {row.mrc}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* The section's own close, not the shared SectionCta: that component
            opens with mt-6, which this repo's spacing scale renders as 48px —
            a gap larger than two comparison rows, in the one section whose
            brief is density. */}
        <div className="mt-[18px] flex justify-center sm:mt-[22px]">
          <Link
            to="/myrecruitercheck-vs-chatgpt"
            className="text-[15px] font-medium text-blue underline-offset-4 transition-colors hover:text-navy hover:underline sm:text-base"
          >
            See the full comparison
          </Link>
        </div>
      </Container>
    </section>
  )
}

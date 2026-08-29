import { Check, X } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { SectionCta } from '@/features/landing/components/SectionCta'
import { cn } from '@/utils/cn'

/**
 * A feature matrix instead of two side-by-side lists. In the old two-card
 * layout each side carried differently worded sentences, so nothing lined
 * up and no claim was checkable head to head. Here every row is one
 * criterion judged for both columns — and two rows go to AI chat honestly,
 * which is what makes the rows that go our way believable. The column is
 * named ChatGPT because that is the name visitors actually weigh us
 * against (the row facts hold for any chatbot, and the linked comparison
 * page covers the rest). Text only, no logo: nominative use of a
 * competitor's name in a truthful comparison, nothing more.
 *
 * Column identities carry the comparison visually: ChatGPT's column is
 * white with near-black text (its own scheme), ours is the brand blue and
 * navy tint, and the criteria rail stays neutral on the warm ground.
 *
 * Every row is a current product truth: structured verdict, the three
 * factor score, generated documents, the dashboard. Nothing here claims
 * calibration studies or ATS parity we cannot evidence.
 */
interface MatrixRow {
  label: string
  chat: boolean
  mrc: boolean
}

/**
 * Five rows, written for a five second scan: a visitor gives this section
 * one pass, so every label is a handful of plain words. Four go our way,
 * one goes to chat honestly — the row we concede is what makes the four we
 * claim believable.
 */
const ROWS: MatrixRow[] = [
  { label: 'A tech recruitment scorecard for your exact job', chat: false, mrc: true },
  { label: 'Recruiter style feedback, not a one off opinion', chat: false, mrc: true },
  { label: 'Not a yes man', chat: false, mrc: true },
  { label: 'No prompts to write', chat: false, mrc: true },
  { label: 'Every check saved and tracked', chat: false, mrc: true },
  { label: 'Free unlimited chat', chat: true, mrc: false },
]

function Verdict({ yes }: { yes: boolean }) {
  return (
    <span className="flex items-center justify-center">
      {yes ? (
        <Check className="h-[20px] w-[20px] text-success" strokeWidth={2} aria-hidden="true" />
      ) : (
        <X className="h-[18px] w-[18px] text-error/60" strokeWidth={2} aria-hidden="true" />
      )}
      <span className="sr-only">{yes ? 'Yes' : 'No'}</span>
    </span>
  )
}

export function LlmComparisonSection() {
  return (
    <section className="border-b border-border bg-background">
      <Container className="py-[56px] sm:py-16 lg:py-[112px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue sm:text-sm">
            The difference
          </p>
          <h2 className="mt-2 font-display text-[24px] text-text-primary sm:text-[32px] lg:text-[44px] lg:leading-[1.14]">
            Why not just use ChatGPT?
          </h2>
          <p className="mt-3 text-base text-text-secondary sm:text-lg">
            You can paste your CV into ChatGPT for free. Here's the difference.
          </p>
        </div>

        <div className="mx-auto mt-7 max-w-[860px] overflow-hidden rounded-[20px] border border-border-soft bg-background shadow-card sm:mt-8">
          {/* Header row. On phones the product column abbreviates to MRC —
              the full name sits in the heading directly above, so the
              shorthand cannot be misread. */}
          <div className="grid grid-cols-[1fr_72px_72px] items-center border-b border-border px-4 py-3 sm:grid-cols-[1fr_130px_170px] sm:px-6">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-text-caption">
              What you get
            </span>
            <span className="mx-auto rounded-full border border-border-strong bg-white px-2.5 py-1 text-center text-xs font-semibold text-[#0D0D0D] sm:px-4 sm:text-sm">
              ChatGPT
            </span>
            <span className="mx-auto rounded-full bg-blue px-2.5 py-1 text-center text-xs font-semibold text-white sm:px-4 sm:text-sm">
              <span className="sm:hidden">MRC</span>
              <span className="hidden sm:inline">MyRecruiterCheck</span>
            </span>
          </div>

          {ROWS.map((row, index) => (
            <div
              key={row.label}
              className={cn(
                'grid grid-cols-[1fr_72px_72px] items-stretch px-4 sm:grid-cols-[1fr_130px_170px] sm:px-6',
                index < ROWS.length - 1 && 'border-b border-border',
              )}
            >
              <span className="flex items-center py-4 pr-3 text-[15px] font-medium leading-snug text-text-primary sm:text-base">
                {row.label}
              </span>
              <span className="flex items-center justify-center bg-white">
                <Verdict yes={row.chat} />
              </span>
              <span className="flex items-center justify-center bg-navy-tint/60">
                <Verdict yes={row.mrc} />
              </span>
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

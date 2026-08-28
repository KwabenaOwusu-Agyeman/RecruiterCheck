import { Check, X } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Container } from '@/components/ui/Container'
import { SectionCta } from '@/features/landing/components/SectionCta'
import { GlowCard } from '@/components/ui/GlowCard'

// Short, scannable phrases only — this section exists to be read in about
// 10 seconds, not to make the full case (that's what
// /myrecruitercheck-vs-chatgpt is for, linked below).
const ROWS = [
  'Same structured verdict every time',
  'Recruiter style evidence framework, not a one off opinion',
  'Real CV, cover letter & message you can download',
  'Every check saved and tracked',
]

const THEM_ROWS = [
  'A different answer depending how you ask',
  'A generic AI opinion',
  'Chat text you reformat yourself',
  'No consistent scoring framework',
]

export function LlmComparisonSection() {
  return (
    <section className="border-b border-border bg-background">
      <Container className="py-[56px] sm:py-16 lg:py-[112px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue sm:text-sm">
            The difference
          </p>
          <h2 className="mt-2 font-display text-[24px] text-text-primary sm:text-[32px] lg:text-[44px] lg:leading-[1.14]">
            Why not just use AI chat?
          </h2>
          <p className="mt-3 text-base text-text-secondary sm:text-lg">
            You can paste your CV into any chatbot for free. Here's the difference.
          </p>
        </div>

        <div className="mx-auto mt-5 grid max-w-3xl gap-5 sm:mt-6 sm:grid-cols-2">
          <GlowCard className="h-full">
            <Card tone="dark" className="h-full overflow-hidden">
              <CardHeader tone="dark" className="px-6 py-4">
                <h3 className="text-base font-semibold text-white">MyRecruiterCheck</h3>
              </CardHeader>
              <CardContent className="px-6 py-5">
                <ul className="space-y-3.5">
                  {ROWS.map((row) => (
                    <li key={row} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-[16px] w-[16px] shrink-0 text-success" aria-hidden="true" />
                      <span className="text-sm leading-snug text-white/90">{row}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </GlowCard>

          <Card tone="muted" className="overflow-hidden">
            <CardHeader className="px-6 py-4">
              <h3 className="text-base font-semibold text-text-primary">ChatGPT, Gemini &amp; other AI chat</h3>
            </CardHeader>
            <CardContent className="px-6 py-5">
              <ul className="space-y-3.5">
                {THEM_ROWS.map((row) => (
                  <li key={row} className="flex items-start gap-3">
                    <X className="mt-0.5 h-[16px] w-[16px] shrink-0 text-error" aria-hidden="true" />
                    <span className="text-sm leading-snug text-text-secondary">{row}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <SectionCta secondaryTo="/myrecruitercheck-vs-chatgpt" secondaryLabel="See the full comparison" />
      </Container>
    </section>
  )
}

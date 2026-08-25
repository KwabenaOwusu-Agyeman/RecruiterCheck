import { Check, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Container } from '@/components/ui/Container'
import { GlowCard } from '@/components/ui/GlowCard'
import { cn } from '@/utils/cn'

// Short, scannable phrases only — this section exists to be read in about
// 10 seconds, not to make the full case (that's what
// /myrecruitercheck-vs-chatgpt is for, linked below).
const ROWS = [
  'Same structured verdict every time',
  'Shaped by real recruiters',
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
      <Container className="py-[32px] sm:py-12 lg:py-[64px]">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-[20px] font-semibold tracking-tight text-text-primary sm:text-3xl">
            Why not just use AI chat?
          </h2>
          <p className="mt-3 text-[14px] text-text-secondary sm:text-base">
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
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
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
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-error" aria-hidden="true" />
                    <span className="text-sm leading-snug text-text-secondary">{row}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="mx-auto mt-6 max-w-3xl text-center">
          <Link
            to="/myrecruitercheck-vs-chatgpt"
            className={cn('text-sm font-semibold text-blue hover:underline')}
          >
            See the full comparison
          </Link>
        </div>
      </Container>
    </section>
  )
}

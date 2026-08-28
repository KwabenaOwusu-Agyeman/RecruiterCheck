import { RotateCcw, Scale, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { cn } from '@/utils/cn'

const ITEMS = [
  { icon: ShieldCheck, label: 'CV deleted in 24h', to: '/privacy' },
  { icon: RotateCcw, label: '7 day refund', to: undefined },
  { icon: Scale, label: 'Why not ChatGPT?', to: '/myrecruitercheck-vs-chatgpt' },
] as const

/**
 * A dark statement panel, not a light pill row (see the BIZZY visual
 * direction and 21st.dev's stat-strip pattern, e.g. its Light Saas Hero
 * Section reference): bold typography carries the row instead of small
 * bordered badges, divided by thin dividers rather than boxed chips. Still
 * one compact row (monday.com's own trust bar below its hero: single line,
 * doesn't eat vertical space), just with more visual confidence than the
 * previous pill treatment.
 */
export function ReassuranceSection() {
  return (
    <section className="border-b border-border bg-navy">
      <Container className="py-3 sm:py-3.5">
        {/* Below sm: flex-wrap + centered gaps, no dividers, no scroll —
            all three items must be visible at once on narrow phones, so
            wrapping to a second line beats a horizontal-scroll row where
            the third item hides off-screen with no visual cue. At sm and
            up the row always fits on one line, so it reverts to the
            original single-row, divider-separated treatment. */}
        <div className="mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:w-fit sm:flex-nowrap sm:justify-start sm:gap-x-0 sm:divide-x sm:divide-white/15 sm:whitespace-nowrap">
          {ITEMS.map((item) => {
            const Icon = item.icon
            const itemClass = cn(
              'flex items-center gap-2 text-sm font-semibold text-white sm:px-5 sm:text-base sm:first:pl-0 sm:last:pr-0',
              item.to && 'transition-colors hover:text-blue-light',
            )
            const inner = (
              <>
                <Icon className="h-4 w-4 shrink-0 text-blue-light sm:h-[18px] sm:w-[18px]" strokeWidth={2.25} aria-hidden="true" />
                {item.label}
              </>
            )
            return item.to ? (
              <Link key={item.label} to={item.to} className={itemClass}>
                {inner}
              </Link>
            ) : (
              <span key={item.label} className={itemClass}>
                {inner}
              </span>
            )
          })}
        </div>
      </Container>
    </section>
  )
}

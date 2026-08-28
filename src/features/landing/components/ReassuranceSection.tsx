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
      <Container className="py-3.5">
        {/* Below sm: an even three-column grid with the icon stacked above
            its label, divided by the same hairlines as the desktop row. The
            previous centre-wrapped flex row broke into an uneven two-then-one
            arrangement on narrow phones, which read as a layout accident
            rather than a designed trust bar. At sm and up the row fits on one
            line, so it reverts to the original inline, divider-separated
            treatment. */}
        <div className="mx-auto grid grid-cols-3 divide-x divide-white/15 sm:flex sm:w-fit sm:items-center sm:justify-start sm:whitespace-nowrap">
          {ITEMS.map((item) => {
            const Icon = item.icon
            const itemClass = cn(
              'flex flex-col items-center justify-start gap-1.5 px-2 text-center text-[12px] font-semibold leading-[1.3] text-white',
              'sm:flex-row sm:gap-2 sm:px-5 sm:text-base sm:first:pl-0 sm:last:pr-0',
              item.to && 'transition-colors hover:text-blue-light',
            )
            const inner = (
              <>
                <Icon className="h-[20px] w-[20px] shrink-0 text-blue-light" strokeWidth={2} aria-hidden="true" />
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

import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useCheckCta } from '@/hooks/useCheckCta'
import { cn } from '@/utils/cn'

interface SectionCtaProps {
  /** Where the quiet secondary link goes; omit for a primary-only close. */
  secondaryTo?: string
  secondaryLabel?: string
  className?: string
}

/**
 * The one way a landing section closes: the primary action beside a quiet
 * secondary link, identical everywhere so the label and the pairing live in
 * a single place. Before this, six of nine sections ended without asking
 * for anything at all, and the ones that did each styled their own button.
 *
 * On phones the primary is hidden: the sticky bottom bar already carries
 * the check action over every section there, and two buttons a thumb apart
 * for the same action read as a bug. The secondary link stays, since it
 * navigates somewhere the sticky bar does not.
 */
export function SectionCta({ secondaryTo, secondaryLabel, className }: SectionCtaProps) {
  const handleCheckCta = useCheckCta()

  return (
    <div
      className={cn(
        'mt-7 flex-col items-center justify-center gap-3 sm:mt-8 sm:flex sm:flex-row sm:gap-5',
        secondaryTo ? 'flex' : 'hidden',
        className,
      )}
    >
      <Button size="md" onClick={handleCheckCta} className="hidden sm:inline-flex">
        Check My Application
      </Button>
      {secondaryTo ? (
        <Link
          to={secondaryTo}
          className="text-base font-medium text-blue underline-offset-4 transition-colors hover:text-navy hover:underline"
        >
          {secondaryLabel}
        </Link>
      ) : null}
    </div>
  )
}

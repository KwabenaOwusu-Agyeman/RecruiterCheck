import { cn } from '@/utils/cn'

interface StepIndicatorProps {
  steps: string[]
  currentIndex: number
  className?: string
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden="true">
      <path d="M3.5 8.2 6.3 11 12.5 4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function StepIndicator({ steps, currentIndex, className }: StepIndicatorProps) {
  return (
    <ol className={cn('flex items-center', className)} aria-label="Progress">
      {steps.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming'
        const isLast = index === steps.length - 1

        return (
          <li key={step} className={cn('flex min-w-0 items-center', !isLast && 'flex-1')}>
            <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <span
                aria-current={state === 'current' ? 'step' : undefined}
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300',
                  state === 'done' && 'bg-navy text-white',
                  state === 'current' && 'border-2 border-navy text-navy',
                  state === 'upcoming' && 'border border-border-strong text-text-secondary',
                )}
              >
                {state === 'done' ? <CheckIcon /> : index + 1}
              </span>
              <span
                className={cn(
                  'truncate text-xs font-medium',
                  state === 'upcoming' ? 'text-text-secondary' : 'text-text-primary',
                )}
              >
                {step}
              </span>
            </span>
            {!isLast ? (
              <span
                aria-hidden="true"
                className="relative mx-2 h-px flex-1 overflow-hidden bg-border-strong sm:mx-3"
              >
                {/* transform: scaleX (not width) so this stays on the CSSOM
                    property-assignment path — a motion/react width animation
                    here produced a real style-src CSP violation, since width
                    is a layout property motion applies via a different,
                    attribute-writing code path than transform/opacity. */}
                <span
                  className={cn(
                    'absolute inset-y-0 left-0 w-full origin-left bg-navy transition-transform duration-[400ms] ease-out',
                    state === 'done' ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

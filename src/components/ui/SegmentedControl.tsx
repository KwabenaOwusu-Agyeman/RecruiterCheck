import { useId } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/utils/cn'

interface SegmentedControlOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  'aria-label': string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const layoutId = useId()

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-lg border border-border p-0.5', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative min-h-[36px] touch-manipulation rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150',
              active ? 'text-white' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {active ? (
              <motion.span
                layoutId={`segmented-pill-${layoutId}`}
                className="absolute inset-0 rounded-md bg-navy shadow-sm"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

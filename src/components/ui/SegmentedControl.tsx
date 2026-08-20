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
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-lg border border-white/30 p-0.5', className)}
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
              'min-h-[36px] touch-manipulation rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150',
              active ? 'bg-white text-navy shadow-sm' : 'text-white hover:text-white',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

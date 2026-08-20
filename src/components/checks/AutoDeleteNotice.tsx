import { cn } from '@/utils/cn'

export function AutoDeleteNotice({ tone = 'dark' }: { tone?: 'light' | 'dark' }) {
  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-xs',
        tone === 'dark' ? 'text-white/85' : 'text-text-secondary',
      )}
    >
      <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
        <rect x="4.5" y="9" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      Uploads are automatically deleted within 24 hours.
    </p>
  )
}

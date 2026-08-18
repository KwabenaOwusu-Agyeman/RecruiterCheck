import { cn } from '@/utils/cn'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-surface-muted', className)} />
}

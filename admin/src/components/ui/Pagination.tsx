import Link from 'next/link'
import { cn } from '@/lib/cn'

export function Pagination({
  page,
  pageCount,
  totalRows,
  buildHref,
}: {
  page: number
  pageCount: number
  totalRows: number
  buildHref: (page: number) => string
}) {
  const linkStyle =
    'inline-flex h-8 items-center rounded-full border border-border-strong bg-surface px-3 text-sm text-text-primary hover:bg-background'
  const disabledStyle = 'pointer-events-none opacity-40'

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3"
    >
      <p className="tabular text-xs text-text-caption">
        Page {page} of {pageCount} · {totalRows.toLocaleString()} row
        {totalRows === 1 ? '' : 's'}
      </p>
      <div className="flex gap-2">
        <Link
          href={buildHref(page - 1)}
          aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined}
          className={cn(linkStyle, page <= 1 && disabledStyle)}
        >
          Previous
        </Link>
        <Link
          href={buildHref(page + 1)}
          aria-disabled={page >= pageCount}
          tabIndex={page >= pageCount ? -1 : undefined}
          className={cn(linkStyle, page >= pageCount && disabledStyle)}
        >
          Next
        </Link>
      </div>
    </nav>
  )
}

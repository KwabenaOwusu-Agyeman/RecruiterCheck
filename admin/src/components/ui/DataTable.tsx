import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { EmptyState } from './States'

export interface Column<T> {
  key: string
  header: string
  /** Right-aligns and applies tabular figures. Use for every numeric column. */
  numeric?: boolean
  render: (row: T) => ReactNode
}

export function DataTable<T>({
  rows,
  columns,
  getKey,
  emptyTitle,
  emptyDescription,
  caption,
}: {
  rows: readonly T[]
  columns: readonly Column<T>[]
  getKey: (row: T) => string
  emptyTitle: string
  emptyDescription?: string
  caption?: string
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    // The wrapper scrolls, not the page: a wide table must never make the whole
    // document scroll sideways on a tablet.
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-caption',
                  column.numeric ? 'text-right' : 'text-left',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getKey(row)}
              className="border-b border-border last:border-0 hover:bg-background"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-4 py-3 align-middle',
                    column.numeric ? 'tabular text-right' : 'text-left',
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export interface Column<T> {
  /** Stable key, and the header label unless `header` says otherwise. */
  key: string
  header?: string
  /** A grid track: `56px`, `1fr`, `minmax(0,1fr)`. */
  width: string
  align?: 'end'
  /** Hidden below this container width, for columns a narrow stage cannot hold. */
  hideUnder?: 'sm' | 'md'
  cell: (row: T) => React.ReactNode
}

export interface Group<T> {
  key: string
  label: string
  rows: T[]
}

interface DataListProps<T> {
  columns: Column<T>[]
  groups: Group<T>[]
  rowKey: (row: T) => string
  /** Makes the whole row a link. Rows without one are not interactive. */
  href?: (row: T) => string
  /** Read by a screen reader in place of the row's own contents. */
  rowLabel?: (row: T) => string
}

const HIDE = { sm: 'hidden @md:grid', md: 'hidden @xl:grid' } as const

function track<T>(columns: Column<T>[]): string {
  return columns.map((c) => c.width).join(' ')
}

/**
 * One list for calls, questions and knowledge, which are the same object at
 * different densities. A group row supplies what the columns leave out.
 */
export function DataList<T>({
  columns,
  groups,
  rowKey,
  href,
  rowLabel,
}: DataListProps<T>) {
  const cols = track(columns)

  return (
    <div className="@container">
      <div role="table" className="[--row:34px]" style={{ ['--cols' as string]: cols }}>
        <div
          role="row"
          className="sticky top-0 z-(--z-sticky) grid gap-3 bg-stage px-2.5 pb-1.5 text-muted-foreground"
          style={{ gridTemplateColumns: cols }}
        >
          {columns.map((c) => (
            <span
              key={c.key}
              className={cn(
                'truncate',
                c.align === 'end' && 'text-right',
                c.hideUnder && HIDE[c.hideUnder],
              )}
            >
              {c.header}
            </span>
          ))}
        </div>

        {groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <div className="border-t border-border px-2.5 pt-3 pb-1.5 font-medium text-foreground">
              {group.label}
            </div>
            {group.rows.map((row) => {
              const cells = columns.map((c) => (
                <span
                  key={c.key}
                  className={cn(
                    'truncate whitespace-nowrap',
                    c.align === 'end' && 'text-right',
                    c.hideUnder && HIDE[c.hideUnder],
                  )}
                >
                  {c.cell(row)}
                </span>
              ))

              if (!href) {
                return (
                  <div
                    key={rowKey(row)}
                    role="row"
                    className="grid h-(--row) items-center gap-3 rounded-lg px-2.5"
                    style={{ gridTemplateColumns: cols }}
                  >
                    {cells}
                  </div>
                )
              }

              return (
                <Link
                  key={rowKey(row)}
                  to={href(row)}
                  aria-label={rowLabel?.(row)}
                  className="grid h-(--row) items-center gap-3 rounded-lg px-2.5 hover:bg-hover active:bg-active"
                  style={{ gridTemplateColumns: cols }}
                >
                  {cells}
                </Link>
              )
            })}
          </section>
        ))}
      </div>
    </div>
  )
}

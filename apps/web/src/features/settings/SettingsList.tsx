import { cn } from '@/lib/utils'

/** One reading measure for every explanatory line. A line needing more than this
 *  needs fewer words. */
export const MEASURE = 'max-w-[62ch]'

interface SectionProps {
  title: string
  /** One line. Omit it when the rows already say what the section is. */
  lede?: string
  /** A control for the section as a whole, on the heading row. */
  action?: React.ReactNode
  /** No card at all when the section holds no rows yet. */
  empty?: boolean
  children: React.ReactNode
  className?: string
}

/** A heading over a card of rows. */
export function Section({
  title,
  lede,
  action,
  empty,
  children,
  className,
}: SectionProps) {
  return (
    <section className={cn('mb-8', className)}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {lede && <p className={cn('mt-1 mb-3 text-muted-foreground', MEASURE)}>{lede}</p>}
      {/* A card round nothing is furniture, and the heading's button says what to do. */}
      {!empty && (
        <ul className={cn('rounded-xl bg-card shadow-control', lede ? '' : 'mt-3')}>
          {children}
        </ul>
      )}
    </section>
  )
}

interface RowProps {
  title: string
  /** One line, always. If it needs two, the setting needs a better name. */
  description?: string
  /** The control. Omit it for a row that only carries an action. */
  children?: React.ReactNode
  /** Stack the control under the label, for a control too wide to sit beside it. */
  stacked?: boolean
  htmlFor?: string
}

/**
 * One setting. Title and description on the left, control on the right, and a
 * hairline above every row but the first.
 */
export function Row({ title, description, children, stacked, htmlFor }: RowProps) {
  const label = (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {title}
      </label>
      {description && (
        <p className={cn('mt-0.5 text-muted-foreground', MEASURE)}>{description}</p>
      )}
    </div>
  )

  if (stacked) {
    return (
      <li className="flex flex-col gap-2 border-t border-border/60 p-4 first:border-t-0">
        {label}
        {children}
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-5 border-t border-border/60 p-4 first:border-t-0">
      {label}
      {children && <div className="shrink-0">{children}</div>}
    </li>
  )
}

/** A row carrying an action rather than a setting, such as Add. */
export function ActionRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-4 border-t border-border/60 p-4 first:border-t-0">
      {children}
    </li>
  )
}

/** A row opened for editing, with its fields as sub-rows. */
export function OpenRow({
  title,
  action,
  children,
}: {
  title: string
  action: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <li className="border-t border-border/60 bg-hover/40 p-4 first:border-t-0">
      <div className="flex items-center justify-between gap-5">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <div className="shrink-0">{action}</div>
      </div>
      <div className="mt-2">{children}</div>
    </li>
  )
}

/** A field inside an opened row. */
export function SubRow({
  title,
  description,
  children,
  htmlFor,
}: {
  title: string
  description?: string
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <div className="flex items-center justify-between gap-5 border-t border-border/60 py-2.5">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
          {title}
        </label>
        {description && (
          <p className={cn('mt-0.5 text-muted-foreground', MEASURE)}>{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

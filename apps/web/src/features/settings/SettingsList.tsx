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

/** Beside the label, or under it. Both rows read from this, so neither drifts. */
function layout(stacked?: boolean) {
  return stacked ? 'flex flex-col gap-2' : 'flex items-center justify-between gap-5'
}

function RowContent({ title, description, children, stacked, htmlFor }: RowProps) {
  return (
    <>
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
          {title}
        </label>
        {description && (
          <p className={cn('mt-0.5 text-muted-foreground', MEASURE)}>{description}</p>
        )}
      </div>
      {children && (stacked ? children : <div className="shrink-0">{children}</div>)}
    </>
  )
}

/**
 * One setting. Title and description on the left, control on the right, and a
 * hairline above every row but the first.
 */
export function Row(props: RowProps) {
  return (
    <li
      className={cn(
        layout(props.stacked),
        'border-t border-border/60 p-4 first:border-t-0',
      )}
    >
      <RowContent {...props} />
    </li>
  )
}

/** A field in a drawer, where the panel is the boundary and a rule adds nothing. */
export function SubRow(props: RowProps) {
  return (
    <div className={cn(layout(props.stacked), 'py-3')}>
      <RowContent {...props} />
    </div>
  )
}

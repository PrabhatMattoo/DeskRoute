import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

/**
 * For a page that has never held data. A filtered view that happens to be empty
 * gets one muted line instead.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      // The deeper foot lifts the block above the true centre, where the eye
      // looks for it.
      className={cn(
        'flex w-full flex-1 items-center justify-center px-6 pt-16 pb-40',
        className,
      )}
    >
      <div className="flex max-w-sm flex-col items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-sunk-1">
          <Icon className="size-5 text-muted-foreground" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-1 text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="mt-1">{action}</div>}
      </div>
    </div>
  )
}

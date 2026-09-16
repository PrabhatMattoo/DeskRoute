import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-lg bg-sunk-1', className)}
      {...props}
    />
  )
}

export { Skeleton }

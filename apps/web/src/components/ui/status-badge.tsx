import { cn } from '@/lib/utils'
import { toneToClasses, type StatusEntry } from '@/lib/status-config'

interface StatusBadgeProps<T extends string> {
  value: T | null | undefined
  config: Record<T, StatusEntry>
  className?: string
}

/**
 * A tone is type and weight rather than a fill, so status reads inline with the
 * row it belongs to. An unmapped value renders nothing.
 */
export function StatusBadge<T extends string>({
  value,
  config,
  className,
}: StatusBadgeProps<T>) {
  const entry = value ? config[value] : undefined
  const label = entry?.label ?? ''
  const tone = entry?.tone ?? 'quiet'

  return (
    <span
      className={cn('inline-flex items-center text-sm', toneToClasses(tone), className)}
    >
      {label}
    </span>
  )
}

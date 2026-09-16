import { Switch as SwitchPrimitive } from '@base-ui/react/switch'

import { cn } from '@/lib/utils'

/**
 * A labelled state rather than a pressed button, so a screen reader announces it
 * as one. The accent appears only when on; off is a neutral track with an edge.
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-[30px] shrink-0 items-center rounded-full border-[0.5px] border-input bg-sunk p-px transition-colors outline-none',
        'data-[checked]:border-transparent data-[checked]:bg-primary',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        data-on-accent=""
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-white shadow-low transition-transform',
          'data-[checked]:size-[18px] data-[checked]:translate-x-[10px]',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

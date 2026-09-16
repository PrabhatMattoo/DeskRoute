import * as React from 'react'
import { Input as InputPrimitive } from '@base-ui/react/input'

import { cn } from '@/lib/utils'

/** A field you type in. Drawn as a sibling of the select: same edge, height and
    radius, and the shadow is what tells them apart. */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-8 min-w-0 rounded-lg border-[0.5px] border-input bg-card px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:bg-input/20 disabled:opacity-50 aria-invalid:border-destructive md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Input }

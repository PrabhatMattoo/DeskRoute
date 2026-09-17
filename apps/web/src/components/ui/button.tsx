import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border-[0.5px] border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition outline-none select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /* Wears the ring's own colour, so `data-on-accent` moves its focus
           outline outside the fill. */
        default:
          'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary',
        /* Rests on --control, the lightest rung, and sinks in two steps. */
        outline:
          'border-input bg-control shadow-low hover:bg-control-hover hover:text-foreground active:bg-control-active aria-expanded:bg-control-hover aria-expanded:text-foreground',
        /* Fill plus a lit ring rather than a border. On a menu or a dialog the
           ground is already near white, so the ring is the entire edge. */
        secondary:
          'bg-control text-secondary-foreground shadow-control hover:bg-control-hover active:bg-control-active aria-expanded:bg-control-hover aria-expanded:text-secondary-foreground',
        /* No fill at rest: a ghost is a control once you point at it. */
        ghost:
          'hover:bg-hover hover:text-foreground active:bg-active aria-expanded:bg-hover aria-expanded:text-foreground',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 active:bg-destructive/30',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3',
        sm: 'h-7 gap-1 px-2.5',
        lg: 'h-9 px-3',
        icon: 'size-8',
        'icon-sm': 'size-7',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-on-accent={variant === 'default' ? '' : undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button }

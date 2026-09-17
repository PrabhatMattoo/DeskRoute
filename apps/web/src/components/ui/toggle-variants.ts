import { cva } from 'class-variance-authority'

/**
 * Every state fill lives in its variant rather than the root string, which is
 * what lets `pill` and `row` behave like the different things they are.
 */
export const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 rounded-lg text-sm font-medium whitespace-nowrap transition outline-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /* No fill at rest: a ghost is a control once you point at it. */
        default:
          'bg-transparent hover:bg-hover hover:text-foreground aria-pressed:bg-active data-[state=on]:bg-active',
        outline:
          'border border-border bg-control shadow-low hover:bg-control-hover aria-pressed:bg-control-active data-[state=on]:bg-control-active',
        /* Lit at rest and sunk when chosen, so the raised pill is the free one.
           The ring holds through both states, so nothing resizes. */
        pill: 'rounded-full border-[0.5px] border-transparent bg-control bg-clip-padding px-2.5 font-medium text-muted-foreground shadow-control hover:bg-control-hover hover:text-foreground aria-pressed:border-transparent aria-pressed:bg-active aria-pressed:text-foreground aria-pressed:shadow-ring data-[state=on]:bg-active data-[state=on]:text-foreground data-[state=on]:shadow-ring',
        /* No rest fill, so its states are the row rungs. Stacks, because it
           carries a title and a line of metadata rather than an icon. */
        row: 'w-full flex-col items-start justify-start whitespace-normal bg-transparent text-left font-normal hover:bg-hover aria-pressed:bg-active data-[state=on]:bg-active',
      },
      size: {
        default:
          'h-7 min-w-7 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        sm: "h-7 min-w-7 px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        /* A row sizes to its own content rather than to a control's rhythm. */
        row: 'h-auto min-w-0 px-3 py-2.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

import { Toaster as SonnerToaster } from 'sonner'

/** Sonner's own Toaster with the product's tokens: the registry wrapper pulls
 *  `next-themes`, which a Vite build does not have. */
function Toaster({ ...props }: React.ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      data-ground="menu"
      position="bottom-right"
      /* All toasts visible rather than stacked, so a second never hides the first. */
      expand
      /* The product is light-only. */
      theme="light"
      /* The same 10px gutter the stage floats on. */
      offset={10}
      /* No close button: a toast dismisses itself, pauses under the pointer, and
         can be swiped away. */
      toastOptions={{
        classNames: {
          /* The `!` is load-bearing: sonner styles the panel through two
             attribute selectors, which beat a bare utility class. */
          toast:
            'group rounded-2xl! border-[0.5px]! border-border! bg-popover! p-4! text-base! text-popover-foreground! shadow-medium!',
          title: 'font-medium text-foreground!',
          description: 'text-muted-foreground!',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-control text-secondary-foreground shadow-control',
          /* Icons are pinned because they carry a hue of their own. Red is the
             exception: destructive is the one thing worth a colour. */
          icon: 'text-muted-foreground',
          error: 'text-destructive [&_[data-icon]]:text-destructive',
          success: 'text-foreground',
          warning: 'text-foreground',
          info: 'text-foreground',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

import { Popover as PopoverPrimitive } from '@base-ui/react/popover'

import { cn } from '@/lib/utils'

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger

function PopoverContent({
  className,
  side = 'bottom',
  sideOffset = 4,
  align = 'start',
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, 'side' | 'sideOffset' | 'align'>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="isolate z-(--z-popover)"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          data-ground="menu"
          className={cn(
            'origin-(--transform-origin) rounded-2xl border-[0.5px] border-border bg-popover p-2 text-popover-foreground shadow-medium duration-100 outline-none data-open:enter-zoom data-closed:exit-zoom',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }

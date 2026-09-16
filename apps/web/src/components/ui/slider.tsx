import { Slider as SliderPrimitive } from '@base-ui/react/slider'

import { cn } from '@/lib/utils'

/** One thumb per value. A scalar `value` is one thumb, an array is one each. */
function thumbCount(
  value: SliderPrimitive.Root.Props['value'],
  defaultValue: SliderPrimitive.Root.Props['defaultValue'],
): number {
  if (Array.isArray(value)) return value.length
  if (Array.isArray(defaultValue)) return defaultValue.length
  return 1
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  return (
    <SliderPrimitive.Root
      className={cn(
        'data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full',
        className,
      )}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-sunk select-none data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: thumbCount(value, defaultValue) }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            data-on-accent=""
            key={index}
            /* The `after` inset widens the hit target without widening the mark. */
            className="relative block size-3 shrink-0 rounded-full bg-primary shadow-control transition-[scale] select-none after:absolute after:-inset-2 hover:scale-110 active:scale-110"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }

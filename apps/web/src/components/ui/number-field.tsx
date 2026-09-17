import { Input } from '@/components/ui/input'
import { digitsToNumber, type Unit } from '@/lib/formatters'

/** Four digits covers every bound the settings allow, 1440 minutes and 365 days. */
const DIGITS = '4ch'

interface NumberFieldProps {
  value: number
  onChange: (value: number) => void
  /** Painted inside the box, never typed. `UNIT` holds the words. */
  unit: Unit
  /** For screen readers. The visible label is the row's own title. */
  label: string
  id?: string
}

/**
 * The unit is drawn rather than chosen, so no duration is a mode and nothing
 * else inside the border competes for the focus ring.
 */
export function NumberField({ value, onChange, unit, label, id }: NumberFieldProps) {
  return (
    <span
      // The box measures its own content, so a short unit leaves no dead space
      // and every count sits the same distance from its unit.
      className="relative inline-flex w-[calc(var(--unit-gutter)+var(--digits)+0.625rem)]"
      style={
        {
          '--unit-gutter': `${unit.length + 2}ch`,
          '--digits': DIGITS,
        } as React.CSSProperties
      }
    >
      <Input
        id={id}
        aria-label={label}
        inputMode="numeric"
        value={String(value)}
        onChange={(e) => onChange(digitsToNumber(e.target.value))}
        className="w-full pr-[var(--unit-gutter)] text-right tabular-nums"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-muted-foreground"
      >
        {unit}
      </span>
    </span>
  )
}

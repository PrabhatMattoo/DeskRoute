import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NumberField } from '@/components/ui/number-field'
import { UNIT } from '@/lib/formatters'
import { SubRow } from './SettingsList'

interface ExtraTimeProps {
  before: number
  after: number
  onChange: (before: number, after: number) => void
}

/**
 * Opt-in, so a business without the concept never meets a minutes field. One row
 * and not a list, because the schema is two integer columns.
 */
export function ExtraTime({ before, after, onChange }: ExtraTimeProps) {
  const shown = before > 0 || after > 0

  if (!shown) {
    return (
      <SubRow title="Extra time" description="Calendar time held either side.">
        <Button variant="outline" size="sm" onClick={() => onChange(15, 0)}>
          <Plus />
          Add extra time
        </Button>
      </SubRow>
    )
  }

  return (
    <SubRow title="Extra time" description="Never said to the caller." stacked>
      <div className="flex items-center gap-2">
        <NumberField
          label="Minutes held before the appointment"
          unit={UNIT.minutes}
          value={before}
          onChange={(n) => onChange(n, after)}
        />
        <span className="text-muted-foreground">before</span>
        <NumberField
          label="Minutes held after the appointment"
          unit={UNIT.minutes}
          value={after}
          onChange={(n) => onChange(before, n)}
        />
        <span className="text-muted-foreground">after</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Remove the extra time"
          onClick={() => onChange(0, 0)}
        >
          <X />
        </Button>
      </div>
    </SubRow>
  )
}

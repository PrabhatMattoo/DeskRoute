import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

interface RecordDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Runs once the panel has finished sliding away. See `useRecordDraft`. */
  onClosed?: () => void
  title: string
  description?: string
  /** Shown as the primary action. Adding and editing use the same drawer. */
  saveLabel: string
  onSave: () => void
  saveDisabled?: boolean
  onRemove?: () => void
  removeLabel?: string
  children: React.ReactNode
}

/** Adding and editing share it, so the list stays visible while several go in. */
export function RecordDrawer({
  open,
  onOpenChange,
  onClosed,
  title,
  description,
  saveLabel,
  onSave,
  saveDisabled,
  onRemove,
  removeLabel = 'Remove',
  children,
}: RecordDrawerProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(nowOpen) => !nowOpen && onClosed?.()}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">{children}</div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          {onRemove ? (
            <Button variant="destructive" onClick={onRemove}>
              {removeLabel}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saveDisabled}>
              {saveLabel}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

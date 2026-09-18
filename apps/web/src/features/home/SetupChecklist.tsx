import { Link } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SetupItem } from './setup-items'

/**
 * The checklist as the page, for an agent with no calls yet. Only the next
 * unfinished item carries the accent, and done is ink and a strike, never green.
 */
export function SetupChecklist({ items }: { items: SetupItem[] }) {
  const next = items.find((i) => !i.done)

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          Three things before your agent can book
        </h2>
        <p className="mt-0.5 max-w-[62ch] text-muted-foreground">
          It is already answering the phone. These are what it needs to put someone in
          your diary rather than take a message.
        </p>
      </div>

      <ul className="rounded-xl bg-card shadow-control">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-5 border-t border-border/60 p-4 first:border-t-0"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                {item.done ? (
                  <Check className="size-4 text-foreground" strokeWidth={2} />
                ) : (
                  <span className="size-3.5 rounded-full border border-input" />
                )}
              </span>
              <div className="min-w-0">
                <p
                  className={
                    item.done
                      ? 'font-medium text-muted-foreground line-through'
                      : 'font-medium text-foreground'
                  }
                >
                  {item.title}
                </p>
                <p className="max-w-[62ch] text-muted-foreground">{item.description}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {item.done ? (
                <span className="text-muted-foreground">Done</span>
              ) : (
                <>
                  <span className="tabular-nums text-muted-foreground">
                    {item.minutes}
                  </span>
                  <Button
                    size="sm"
                    variant={item.id === next?.id ? 'default' : 'outline'}
                    render={<Link to={item.to} />}
                    nativeButton={false}
                  >
                    {item.action}
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Demoted to one line once calls arrive. The rail keeps a way back to it. */
export function SetupBanner({
  items,
  onDismiss,
}: {
  items: SetupItem[]
  onDismiss: () => void
}) {
  const missing = items.filter((i) => !i.done)
  if (missing.length === 0) return null

  const names = missing.map((i) => i.title.replace(/^(Add|Set|Connect) (your )?/, ''))
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

  return (
    <div className="mb-6 flex items-center justify-between gap-5 rounded-xl bg-card p-3.5 pl-4 shadow-control">
      <p className="min-w-0">
        Your agent is answering, but it cannot book yet —{' '}
        <span className="text-muted-foreground">still needs {list}.</span>
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          render={<Link to="/settings?tab=business" />}
          nativeButton={false}
        >
          Finish setup
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Hide this" onClick={onDismiss}>
          <X />
        </Button>
      </div>
    </div>
  )
}

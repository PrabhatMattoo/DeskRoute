import { useCallback, useEffect, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import type { AvailableNumber } from '@receptionist/shared'
import { client } from '@/lib/client'
import { ApiError, fail } from '@/lib/queries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatPhone } from '@/lib/formatters'
import { cn } from '@/lib/utils'

/**
 * Area code only, because that is all `searchPhoneNumbers` accepts. Nothing is
 * purchased here, so a number in this list is available rather than reserved.
 */
export function NumberSearch({
  selected,
  onSelect,
}: {
  selected: string | null
  onSelect: (e164: string) => void
}) {
  const [areaCode, setAreaCode] = useState('')
  const [numbers, setNumbers] = useState<AvailableNumber[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Three digits or nothing: LiveKit answers a partial code with an opaque 400
  // rather than an empty list, so a half-typed one must not be sent.
  const searchable = areaCode.length === 0 || areaCode.length === 3

  const search = useCallback(async (code: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await client.onboarding.phone.search.$get({
        query: code ? { areaCode: code } : {},
      })
      if (!res.ok) return fail(res)
      const data = await res.json()
      setNumbers(data)
      if (data.length === 0) {
        setError(
          code
            ? `No numbers free in ${code}. Try another area code, or leave it blank.`
            : 'No numbers are available right now.',
        )
      }
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.info : undefined
      setError(message ?? 'Could not reach the number list. Try again.')
      setNumbers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void search('')
  }, [search])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="area-code" className="font-medium text-foreground">
          Area code
        </label>
        <p className="text-muted-foreground">
          Three digits, so the number reads as local. Leave it blank for numbers anywhere
          in the US.
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span className="relative inline-flex">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="area-code"
              className="w-field-sm pr-8 pl-8 tabular-nums"
              inputMode="numeric"
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchable) void search(areaCode)
              }}
            />
            {areaCode && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Clear the area code"
                className="absolute top-0.5 right-0.5"
                onClick={() => {
                  setAreaCode('')
                  void search('')
                }}
              >
                <X />
              </Button>
            )}
          </span>
          <Button
            variant="outline"
            onClick={() => void search(areaCode)}
            disabled={loading || !searchable}
          >
            Search
          </Button>
          {!searchable && (
            <span className="text-muted-foreground">
              {3 - areaCode.length} more {areaCode.length === 2 ? 'digit' : 'digits'}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <p className="py-2 text-muted-foreground">{error}</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            {numbers.length} available{areaCode && ` in ${areaCode}`}.
          </p>
          <ul className="rounded-xl bg-card shadow-control">
            {numbers.map((n) => {
              const on = n.e164_format === selected
              return (
                <li key={n.id ?? n.e164_format}>
                  <button
                    type="button"
                    onClick={() => onSelect(n.e164_format)}
                    aria-pressed={on}
                    className={cn(
                      'flex w-full items-center justify-between gap-4 border-t border-border/60 p-4 text-left first:rounded-t-xl first:border-t-0 last:rounded-b-xl',
                      on ? 'bg-active' : 'hover:bg-hover',
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          'flex size-[18px] shrink-0 items-center justify-center rounded-full',
                          on ? 'bg-primary' : 'border-[0.5px] border-input',
                        )}
                      >
                        {on && (
                          <Check
                            className="size-3 text-primary-foreground"
                            strokeWidth={3}
                          />
                        )}
                      </span>
                      <span className="text-base font-medium tabular-nums">
                        {formatPhone(n.e164_format)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {[n.locality, n.region].filter(Boolean).join(', ')}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="text-muted-foreground">
            You can move to a different number later. Giving one up for good is permanent,
            so we keep that out of the dashboard.
          </p>
        </>
      )}
    </div>
  )
}

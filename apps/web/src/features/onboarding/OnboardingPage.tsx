import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { keys } from '@/lib/queries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IndustryPicker } from './IndustryPicker'
import { NumberSearch } from './NumberSearch'

/** Every zone the platform knows. The backend validates against the same list. */
const TIMEZONES: string[] = Intl.supportedValuesOf('timeZone')

/** A name, a number and a timezone answer a call. Services, hours and the
 *  calendar book on it, and live on Home's setup checklist. */
export default function OnboardingPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  )
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const ready = name.trim().length > 0 && industry.trim().length > 0 && !!phoneNumber

  async function finish() {
    if (!ready || submitting) return
    setSubmitting(true)
    try {
      await apiClient.post('/onboarding', {
        name: name.trim(),
        industry: industry.trim(),
        timezone,
        phoneNumber,
        agentProfile: {
          name: 'Your agent',
          greeting: `Thanks for calling ${name.trim()}. How can I help?`,
          farewell: 'Thanks for calling. Have a good day.',
          fallback:
            'I am not sure about that one, but I will pass it on and someone will get back to you.',
        },
      })
      // The gate caches its answer for the session, so it has to be told.
      await qc.invalidateQueries({ queryKey: keys.session })
      navigate('/')
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Setup failed. Try again.'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto flex w-full max-w-narrow flex-col gap-9">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Set up your receptionist
          </h1>
          <p className="mt-1 text-md text-muted-foreground">
            Two things, and your number starts being answered. Everything else can wait
            until you have heard it work.
          </p>
        </div>

        <section className="flex flex-col gap-6">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Your business
          </h2>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="biz-name" className="font-medium text-foreground">
              Business name
            </label>
            <p className="text-muted-foreground">
              Your agent says this out loud the moment it answers a call.
            </p>
            <Input
              id="biz-name"
              className="mt-1 w-field-lg"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-foreground">Kind of business</span>
            <p className="text-muted-foreground">
              Your agent only uses this if a caller asks what you do.
            </p>
            <IndustryPicker value={industry} onChange={setIndustry} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="tz" className="font-medium text-foreground">
              Timezone
            </label>
            <p className="text-muted-foreground">
              Your agent quotes every time in this zone. We guessed from your browser.
            </p>
            <Select value={timezone} onValueChange={(v) => v && setTimezone(v)}>
              <SelectTrigger id="tz" className="mt-1 w-field-lg">
                <SelectValue placeholder="Pick a timezone" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <div className="h-px bg-border" />

        <section className="flex flex-col gap-4">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Your number
          </h2>
          <NumberSearch selected={phoneNumber} onSelect={setPhoneNumber} />
        </section>

        <div className="flex items-center gap-3 pb-6">
          <Button size="lg" disabled={!ready || submitting} onClick={finish}>
            {submitting ? 'Setting up…' : 'Finish setup'}
          </Button>
          <span className="text-muted-foreground">
            Nothing is bought until you press this.
          </span>
        </div>
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { Service, ServiceDraft } from '@receptionist/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { isAxiosError } from 'axios'
import { apiClient } from '@/lib/apiClient'
import { keys } from '@/lib/queries'
import { formatMinutes, UNIT } from '@/lib/formatters'
import { emptyService } from '@/lib/service-defaults'
import type { AppSettings } from '@/lib/settings-types'
import { Section, Row, SubRow } from './SettingsList'
import { NumberField } from '@/components/ui/number-field'
import { ExtraTime } from './ExtraTime'
import { IndustryField } from './IndustryField'
import { RecordDrawer } from './RecordDrawer'
import { useRecordDraft } from './useRecordDraft'
import { useServerSeed } from './useServerSeed'
import { SaveBar } from './SaveBar'

/** Every zone the platform knows. The backend validates against the same list. */
const TIMEZONES: string[] = Intl.supportedValuesOf('timeZone')

/** A row being edited. An existing service carries its id, a new one does not. */
type Row_ = ServiceDraft & { id?: string }

function serviceChanged(row: Row_, original: Service): boolean {
  return (
    row.name !== original.name ||
    row.price !== original.price ||
    (row.description ?? '') !== (original.description ?? '') ||
    row.durationMinutes !== original.durationMinutes ||
    row.bufferBeforeMinutes !== original.bufferBeforeMinutes ||
    row.bufferAfterMinutes !== original.bufferAfterMinutes
  )
}

function summarise(s: Row_): string {
  const parts = [formatMinutes(s.durationMinutes)]
  if (s.bufferBeforeMinutes > 0)
    parts.push(`${formatMinutes(s.bufferBeforeMinutes)} held before`)
  if (s.bufferAfterMinutes > 0)
    parts.push(`${formatMinutes(s.bufferAfterMinutes)} held after`)
  return parts.join(' · ')
}

export function BusinessPanel({ settings }: { settings: AppSettings }) {
  const qc = useQueryClient()
  const server = settings.business

  const [form, setForm] = useState({
    name: server.name,
    industry: server.industry,
    timezone: server.timezone,
    description: server.description,
  })
  const [rows, setRows] = useState<Row_[]>(() => server.services.map((s) => ({ ...s })))
  /* `index: null` is a record being added, which joins `rows` only on save. */
  const {
    draft,
    open: drawerOpen,
    edit: editDraft,
    patch: patchDraft,
    close: closeDrawer,
    reset: resetDraft,
    clear: clearDraft,
  } = useRecordDraft<{ index: number | null; value: Row_ }>()

  const changes = useMemo(() => {
    const out: string[] = []
    if (form.name !== server.name) out.push('business name')
    if (form.industry !== server.industry) out.push('industry')
    if (form.timezone !== server.timezone) out.push('timezone')
    if (form.description !== server.description) out.push('description')

    const original = new Map(server.services.map((s) => [s.id, s]))
    const surviving = new Set(rows.map((r) => r.id).filter(Boolean))
    const removed = server.services.filter((s) => !surviving.has(s.id)).length
    const added = rows.filter((r) => !r.id && r.name.trim()).length
    const edited = rows.filter((r) => {
      const before = r.id ? original.get(r.id) : undefined
      return before && serviceChanged(r, before)
    }).length
    const touched = removed + added + edited
    if (touched > 0) out.push(`${touched} ${touched === 1 ? 'service' : 'services'}`)
    return out
  }, [form, rows, server])

  /* A save re-seeds so a new service picks up the id it was given and cannot be
     created twice. A background refetch must not, or it eats the edit. */
  const expectReseed = useServerSeed(server, changes.length > 0, () => {
    setForm({
      name: server.name,
      industry: server.industry,
      timezone: server.timezone,
      description: server.description,
    })
    setRows(server.services.map((s) => ({ ...s })))
    resetDraft()
  })

  const unnamed = rows.some((r) => !r.name.trim())

  /* The agent books a service by name, so two rows sharing one leave it unable
     to tell them apart. `services_agent_name_idx` holds the same line. */
  const named = rows.map((r) => r.name.trim().toLowerCase()).filter(Boolean)
  const duplicated = new Set(named).size < named.length

  const save = useMutation({
    mutationFn: async () => {
      const original = new Map(server.services.map((s) => [s.id, s]))
      const surviving = new Set(rows.map((r) => r.id).filter(Boolean) as string[])

      /* Deletes first, so a rename reusing a removed service's name does not
         collide with the row on its way out. */
      await Promise.all(
        server.services
          .filter((s) => !surviving.has(s.id))
          .map((s) => apiClient.delete(`/admin/services/${s.id}`)),
      )
      await Promise.all([
        apiClient.patch('/admin/settings', { business: form }),
        ...rows
          .filter((r) => {
            const before = r.id ? original.get(r.id) : undefined
            return before && serviceChanged(r, before)
          })
          .map(({ id, ...draft }) => apiClient.patch(`/admin/services/${id}`, draft)),
        ...rows
          .filter((r) => !r.id && r.name.trim())
          .map(({ id: _id, ...draft }) => apiClient.post('/admin/services', draft)),
      ])
    },
    onSuccess: async () => {
      expectReseed()
      await qc.invalidateQueries({ queryKey: keys.settings })
      toast.success('Business saved')
    },
    onError: (err) => {
      const conflict = isAxiosError(err) && err.response?.status === 409
      const message = (err as { response?: { data?: { error?: string } } }).response?.data
        ?.error
      toast.error(conflict && message ? message : 'Could not save. Try again.')
    },
  })

  function discard() {
    setForm({
      name: server.name,
      industry: server.industry,
      timezone: server.timezone,
      description: server.description,
    })
    setRows(server.services.map((s) => ({ ...s })))
    resetDraft()
  }

  const patch = (next: Partial<ServiceDraft>) =>
    patchDraft((d) => ({ ...d, value: { ...d.value, ...next } }))

  function commit() {
    if (!draft) return
    setRows((rs) =>
      draft.index === null
        ? [...rs, draft.value]
        : rs.map((r, i) => (i === draft.index ? draft.value : r)),
    )
    closeDrawer()
  }

  function removeDraft() {
    if (draft?.index !== null && draft) {
      setRows((rs) => rs.filter((_, i) => i !== draft.index))
    }
    closeDrawer()
  }

  return (
    <div>
      <Section title="Business">
        <Row
          title="Business name"
          description="Your agent says the name the moment a call connects."
          htmlFor="biz-name"
        >
          <Input
            id="biz-name"
            className="w-field-md"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Row>
        <Row
          title="Kind of business"
          description="Your agent names the trade when a caller asks what you do."
          htmlFor="industry"
        >
          <IndustryField
            id="industry"
            value={form.industry}
            onChange={(industry) => setForm((f) => ({ ...f, industry }))}
          />
        </Row>
        <Row
          title="Timezone"
          description="Your agent quotes every appointment in this zone."
          htmlFor="timezone"
        >
          <Select
            value={form.timezone}
            onValueChange={(v) => v && setForm((f) => ({ ...f, timezone: v }))}
          >
            <SelectTrigger id="timezone" className="w-field-md">
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
        </Row>
        <Row
          title="Description"
          description="Anything a caller asks beyond services and hours."
          htmlFor="description"
          stacked
        >
          <Textarea
            id="description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="min-h-16 resize-none"
          />
        </Row>
      </Section>

      <Section
        title="Services"
        lede="What a caller can book by phone."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => editDraft({ index: null, value: emptyService() })}
          >
            <Plus />
            Add service
          </Button>
        }
        empty={rows.length === 0}
      >
        {rows.map((row, i) => (
          <Row
            key={row.id ?? `new-${i}`}
            title={row.name || 'Untitled service'}
            description={summarise(row)}
          >
            <div className="flex items-center gap-4">
              <span className="font-medium">{row.price}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => editDraft({ index: i, value: row })}
              >
                Edit
              </Button>
            </div>
          </Row>
        ))}
      </Section>

      {draft && (
        <RecordDrawer
          open={drawerOpen}
          onOpenChange={(v) => !v && closeDrawer()}
          onClosed={clearDraft}
          title={draft.index === null ? 'New service' : draft.value.name || 'Service'}
          description="How your agent quotes and books this service."
          saveLabel="Done"
          saveDisabled={!draft.value.name.trim()}
          onSave={commit}
          onRemove={draft.index === null ? undefined : removeDraft}
          removeLabel="Remove service"
        >
          <SubRow
            title="Service name"
            description="What a caller asks for by name."
            htmlFor="svc-name"
          >
            <Input
              id="svc-name"
              className="w-field-md"
              value={draft.value.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </SubRow>
          <SubRow
            title="Price"
            description="Said out loud when a caller asks."
            htmlFor="svc-price"
          >
            <Input
              id="svc-price"
              className="w-field-md"
              placeholder="$45, or from $150"
              value={draft.value.price}
              onChange={(e) => patch({ price: e.target.value })}
            />
          </SubRow>
          <SubRow
            title="Appointment length"
            description="How long the appointment runs."
            htmlFor="svc-length"
          >
            <NumberField
              id="svc-length"
              label="Appointment length in minutes"
              unit={UNIT.minutes}
              value={draft.value.durationMinutes}
              onChange={(durationMinutes) => patch({ durationMinutes })}
            />
          </SubRow>
          <SubRow
            title="Details"
            description="Your agent reads these details when a caller asks for more."
            htmlFor="svc-desc"
            stacked
          >
            <Textarea
              id="svc-desc"
              rows={2}
              className="w-full resize-none"
              placeholder="Please arrive five minutes early"
              value={draft.value.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </SubRow>
          <ExtraTime
            before={draft.value.bufferBeforeMinutes}
            after={draft.value.bufferAfterMinutes}
            onChange={(bufferBeforeMinutes, bufferAfterMinutes) =>
              patch({ bufferBeforeMinutes, bufferAfterMinutes })
            }
          />
        </RecordDrawer>
      )}

      <SaveBar
        changes={unnamed || duplicated ? [] : changes}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onDiscard={discard}
      />
    </div>
  )
}

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuth } from '@/features/auth/authContext'
import { ApiError, apiRequest } from '@/shared/api/client'
import { listMapVersionsForWarehouse } from '@/shared/api/navigation'
import {
  cancelWave,
  createSchedule,
  listSchedules,
  setScheduleState,
  type ScheduleRecurrence,
  type TransportSchedule,
  type TransportWave,
} from '@/shared/api/schedules'
import { listStorageLocations, listWarehouses } from '@/shared/api/warehouses'
import { listWorkflows } from '@/shared/api/workflows'
import { hasPermission, PERMISSIONS } from '@/shared/auth/permissions'
import { formatIsoDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { Dialog } from '@/shared/ui/Dialog'
import { Field, FieldRow, FormError } from '@/shared/ui/Field'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { controlClass } from '@/shared/ui/controlClass'

type Tone = 'green' | 'grey' | 'amber' | 'red' | 'blue'

const SCHEDULE_TONE: Record<TransportSchedule['status'], Tone> = {
  ACTIVE: 'green',
  PAUSED: 'amber',
  CANCELLED: 'grey',
  FINISHED: 'grey',
}

const WAVE_TONE: Record<TransportWave['status'], Tone> = {
  PLANNED: 'blue',
  STARTED: 'green',
  SKIPPED: 'grey',
  MISSED: 'amber',
  CANCELLED: 'grey',
  FAILED: 'red',
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const QUERY_KEY = ['transport-schedules']

function errorText(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

function describe(schedule: TransportSchedule) {
  const days = schedule.recurrence === 'WEEKLY' ? ` ${schedule.daysOfWeek.map((d) => DAY_NAMES[d]).join(', ')}` : ''
  return `${schedule.recurrence.toLowerCase()}${days} at ${schedule.localTime} (${schedule.timezone})`
}

/**
 * WH-09: each wave picks the stored Containers that match the rule when it is due and queues one Transport Request.
 * The request still waits for someone to start it: a schedule does not move a robot by itself.
 */
export function SchedulesPage() {
  const { capabilities } = useAuth()
  const mayWrite = hasPermission(capabilities, PERMISSIONS.transportCreate)
  const queryClient = useQueryClient()
  const schedules = useQuery({ queryKey: QUERY_KEY, queryFn: () => listSchedules(), refetchInterval: 15_000 })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function act(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorText(err, 'That could not be done.'))
    }
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY })
  }

  const items = schedules.data?.items ?? []

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-book">Transport schedules</h1>
          <p className="mt-1 text-sm text-muted">
            Each wave queues one request from what is on the shelf at that time. Someone still starts it.
          </p>
        </div>
        {mayWrite ? (
          <Button variant="primary" onClick={() => setCreating(true)}>
            New schedule
          </Button>
        ) : null}
      </header>

      {error ? <FormError>{error}</FormError> : null}

      {items.length === 0 ? (
        <p className="text-sm text-muted">
          {schedules.isPending ? 'Loading schedules…' : schedules.isError ? 'Schedules could not be loaded.' : 'No schedules yet.'}
        </p>
      ) : null}

      {items.map((schedule) => {
        const open = schedule.status === 'ACTIVE' || schedule.status === 'PAUSED'
        return (
          <section key={schedule.id} className="rounded-md bg-surface p-4">
            <header className="mb-3 flex flex-wrap items-center gap-3">
              <strong className="font-medium">{schedule.name}</strong>
              <StatusBadge tone={SCHEDULE_TONE[schedule.status]}>{schedule.status}</StatusBadge>
              <span className="text-xs text-muted">
                {describe(schedule)}, at most {schedule.maxContainersPerWave} per wave
              </span>
              {mayWrite && open ? (
                <span className="ml-auto flex gap-2">
                  {schedule.status === 'ACTIVE' ? (
                    <Button size="sm" variant="ghost" onClick={() => void act(() => setScheduleState(schedule.id, 'pause'))}>
                      Pause
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => void act(() => setScheduleState(schedule.id, 'resume'))}>
                      Resume
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => void act(() => setScheduleState(schedule.id, 'cancel'))}>
                    Cancel schedule
                  </Button>
                </span>
              ) : null}
            </header>
            <Table>
              <thead>
                <tr>
                  <Th>Planned</Th>
                  <Th>Status</Th>
                  <Th>Containers</Th>
                  <Th>Note</Th>
                  <Th align="right">{mayWrite ? 'Action' : ''}</Th>
                </tr>
              </thead>
              <tbody>
                {schedule.waves.map((wave) => (
                  <Tr key={wave.id}>
                    <Td>{formatIsoDateTime(wave.plannedAt)}</Td>
                    <Td>
                      <StatusBadge tone={WAVE_TONE[wave.status]}>{wave.status}</StatusBadge>
                    </Td>
                    <Td tone="faint">{wave.status === 'STARTED' ? wave.containerCount : '—'}</Td>
                    <Td tone="faint">{wave.note ?? '—'}</Td>
                    <Td align="right">
                      {mayWrite && wave.status === 'PLANNED' ? (
                        <Button size="sm" variant="ghost" onClick={() => void act(() => cancelWave(wave.id))}>
                          Cancel wave
                        </Button>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
                {schedule.waves.length === 0 ? <EmptyRow colSpan={5}>The first wave appears within a minute.</EmptyRow> : null}
              </tbody>
            </Table>
          </section>
        )
      })}

      {creating ? (
        <CreateScheduleDialog
          onClose={() => setCreating(false)}
          onCreated={() => void queryClient.invalidateQueries({ queryKey: QUERY_KEY })}
        />
      ) : null}
    </div>
  )
}

function CreateScheduleDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const warehouses = useQuery({ queryKey: ['schedule-warehouses'], queryFn: () => listWarehouses({ isActive: true }) })
  const [warehouseId, setWarehouseId] = useState('')
  const warehouse = warehouses.data?.items.find((w) => w.id === warehouseId) ?? warehouses.data?.items[0]
  const activeId = warehouse?.id ?? ''

  const maps = useQuery({
    queryKey: ['schedule-maps', activeId],
    queryFn: () => listMapVersionsForWarehouse(activeId),
    enabled: Boolean(activeId),
  })
  const locations = useQuery({
    queryKey: ['schedule-locations', activeId],
    queryFn: () => listStorageLocations({ warehouseId: activeId, activeOnly: true }),
    enabled: Boolean(activeId),
  })
  const workflows = useQuery({ queryKey: ['schedule-workflows'], queryFn: () => listWorkflows({ status: 'PUBLISHED' }) })
  const products = useQuery({
    queryKey: ['schedule-products'],
    queryFn: () => apiRequest<{ items: { id: string; sku: string; name: string }[] }>('/api/warehouse/products'),
  })

  const [name, setName] = useState('')
  const [workflowId, setWorkflowId] = useState('')
  const [productId, setProductId] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [max, setMax] = useState('1')
  const [recurrence, setRecurrence] = useState<ScheduleRecurrence>('DAILY')
  const [time, setTime] = useState('08:00')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [days, setDays] = useState<number[]>([1])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shelves = locations.data?.items ?? []
  const publishedMap = maps.data?.find((map) => map.status === 'PUBLISHED')

  async function submit() {
    const destination = shelves.find((shelf) => shelf.id === destinationId)
    if (!name.trim() || !workflowId || !productId || !sourceId || !destination || !publishedMap || !warehouse) {
      setError('Fill in every field. The warehouse needs a published map.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await createSchedule({
        name: name.trim(),
        warehouseId: warehouse.id,
        mapVersionId: publishedMap.id,
        workflowId,
        productId,
        sourceStorageLocationId: sourceId,
        destinationEndpointId: destination.endpointId,
        destinationStorageLocationId: destination.id,
        maxContainersPerWave: Number(max) || 1,
        recurrence,
        localTime: `${time}:00`,
        startDate,
        daysOfWeek: recurrence === 'WEEKLY' ? days : undefined,
        timezone: warehouse.timezone ?? 'Asia/Ho_Chi_Minh',
      })
      onCreated()
      onClose()
    } catch (err) {
      setError(errorText(err, 'The schedule could not be created.'))
      setBusy(false)
    }
  }

  const control = controlClass()

  return (
    <Dialog title="New schedule" submitLabel="Create schedule" busy={busy} onClose={onClose} onSubmit={() => void submit()}>
      <Field label="Name">
        <input className={control} value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="Warehouse">
        <select className={control} value={activeId} onChange={(event) => setWarehouseId(event.target.value)}>
          {(warehouses.data?.items ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Workflow">
        <select className={control} value={workflowId} onChange={(event) => setWorkflowId(event.target.value)}>
          <option value="">Choose…</option>
          {(workflows.data?.items ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Product">
        <select className={control} value={productId} onChange={(event) => setProductId(event.target.value)}>
          <option value="">Choose…</option>
          {(products.data?.items ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.sku} · {item.name}
            </option>
          ))}
        </select>
      </Field>
      <FieldRow>
        <Field label="From shelf">
          <select className={control} value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
            <option value="">Choose…</option>
            {shelves.map((shelf) => (
              <option key={shelf.id} value={shelf.id}>
                {shelf.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To shelf">
          <select className={control} value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
            <option value="">Choose…</option>
            {shelves.map((shelf) => (
              <option key={shelf.id} value={shelf.id}>
                {shelf.code}
              </option>
            ))}
          </select>
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Repeats">
          <select className={control} value={recurrence} onChange={(event) => setRecurrence(event.target.value as ScheduleRecurrence)}>
            <option value="ONCE">Once</option>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
          </select>
        </Field>
        <Field label="At most, per wave">
          <input className={control} type="number" min={1} max={200} value={max} onChange={(event) => setMax(event.target.value)} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Time">
          <input className={control} type="time" value={time} onChange={(event) => setTime(event.target.value)} />
        </Field>
        <Field label="Start date">
          <input className={control} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </Field>
      </FieldRow>
      {recurrence === 'WEEKLY' ? (
        <Field label="Days">
          <div className="flex flex-wrap gap-3 text-sm">
            {DAY_NAMES.map((day, index) => (
              <label key={day} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={days.includes(index)}
                  onChange={(event) =>
                    setDays(event.target.checked ? [...days, index] : days.filter((value) => value !== index))
                  }
                />
                {day}
              </label>
            ))}
          </div>
        </Field>
      ) : null}
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  )
}

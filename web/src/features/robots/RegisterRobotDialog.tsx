import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/client'
import { registerRobot } from '@/shared/api/fleet'
import { listMapVersionsForWarehouse } from '@/shared/api/navigation'
import { listWarehouses } from '@/shared/api/warehouses'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Dialog'
import { Field, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'

interface RegisterRobotDialogProps {
  onClose: () => void
  onRegistered: (code: string) => void
}

export function RegisterRobotDialog({ onClose, onRegistered }: RegisterRobotDialogProps) {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [mapVersionId, setMapVersionId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ isActive: true, take: 100 }),
  })

  const mapsQuery = useQuery({
    queryKey: ['map-versions', warehouseId],
    queryFn: () => listMapVersionsForWarehouse(warehouseId),
    enabled: Boolean(warehouseId),
  })

  const publishedMaps = useMemo(
    () => (mapsQuery.data ?? []).filter((map) => map.status === 'PUBLISHED'),
    [mapsQuery.data],
  )

  const mutation = useMutation({
    mutationFn: () =>
      registerRobot({
        warehouseId,
        currentMapVersionId: mapVersionId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
      }),
    onSuccess: (robot) => {
      queryClient.invalidateQueries({ queryKey: ['fleet-robots'] })
      onRegistered(robot.code)
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const field = error.errors.map((e) => `${e.path}: ${e.message}`).join('; ')
        setFormError(field || error.message)
        return
      }
      setFormError((error as Error).message || 'Failed to register robot.')
    },
  })

  function submit() {
    setFormError(null)
    if (!code.trim()) {
      setFormError('Robot code is required.')
      return
    }
    if (!name.trim()) {
      setFormError('Robot name is required.')
      return
    }
    if (!warehouseId) {
      setFormError('Warehouse is required.')
      return
    }
    if (!mapVersionId) {
      setFormError('Current map version is required.')
      return
    }
    mutation.mutate()
  }

  return (
    <Modal
      title="Register Robot"
      subtitle="Create a robot record. Operational and connectivity states are managed by the system."
      onClose={onClose}
      width="w-[560px]"
    >
      <div className="flex flex-col gap-4 px-6 py-5">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">General information</p>

        <Field label="Robot code *">
          <input
            className={controlClass()}
            value={code}
            placeholder="RBT-001"
            autoFocus
            onChange={(event) => setCode(event.target.value)}
          />
        </Field>

        <Field label="Robot name *">
          <input
            className={controlClass()}
            value={name}
            placeholder="Warehouse Robot 01"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="Warehouse *">
          <select
            className={controlClass()}
            value={warehouseId}
            onChange={(event) => {
              setWarehouseId(event.target.value)
              setMapVersionId('')
            }}
            disabled={warehousesQuery.isLoading}
          >
            <option value="">Select warehouse…</option>
            {(warehousesQuery.data?.items ?? []).map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} — {warehouse.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Current map version *">
          <select
            className={controlClass()}
            value={mapVersionId}
            onChange={(event) => setMapVersionId(event.target.value)}
            disabled={!warehouseId || mapsQuery.isLoading}
          >
            <option value="">
              {!warehouseId
                ? 'Select a warehouse first…'
                : mapsQuery.isLoading
                  ? 'Loading maps…'
                  : publishedMaps.length === 0
                    ? 'No published map for this warehouse'
                    : 'Select map version…'}
            </option>
            {publishedMaps.map((map) => (
              <option key={map.id} value={map.id}>
                v{map.versionNo} — {map.name} ({map.status})
              </option>
            ))}
          </select>
        </Field>

        <div className="rounded-md border border-outline-soft bg-container px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Initial state</p>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Operational status</dt>
              <dd>
                <StatusBadge tone="grey" withDot>
                  OFFLINE
                </StatusBadge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Connectivity</dt>
              <dd className="font-medium">Offline</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Enabled</dt>
              <dd className="font-medium">Yes</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">
            Operational and connectivity states are managed automatically by the system and updated from robot
            heartbeat/telemetry.
          </p>
        </div>

        {warehousesQuery.error ? (
          <FormError>{(warehousesQuery.error as Error).message}</FormError>
        ) : null}
        {mapsQuery.error ? <FormError>{(mapsQuery.error as Error).message}</FormError> : null}
        {formError ? <FormError>{formError}</FormError> : null}
      </div>

      <footer className="flex justify-end gap-2 px-6 pb-6">
        <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={mutation.isPending}>
          {mutation.isPending ? 'Registering…' : 'Register Robot'}
        </Button>
      </footer>
    </Modal>
  )
}

import { useState } from 'react'
import type { StorageLocationView } from '@/shared/api/contracts'
import { Button } from '@/shared/ui/Button'
import { Dialog } from '@/shared/ui/Dialog'
import { Field, FieldRow, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { Table, Td, Th, Tr } from '@/shared/ui/Table'
import { ENDPOINT_OPTIONS, WAREHOUSES } from './mock'
import { AddButton, SectionHead } from './SectionHead'

interface LocationDraft {
  code: string
  name: string
  warehouseId: string
  endpointId: string
}

interface LocationsSectionProps {
  locations: StorageLocationView[]
  setLocations: (update: (current: StorageLocationView[]) => StorageLocationView[]) => void
}

/**
 * warehouse.storage_locations: a simple logical place such as "Shelf A" that points at exactly one Navigation Endpoint.
 * Aisle/Bay/Level/Bin are not modelled (rules/00). Code is unique per warehouse, an Endpoint serves one location only.
 */
export function LocationsSection({ locations, setLocations }: LocationsSectionProps) {
  const [draft, setDraft] = useState<LocationDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const used = new Set(locations.map((location) => location.endpointId))
  const freeEndpoints = ENDPOINT_OPTIONS.filter((endpoint) => !used.has(endpoint.id))

  function open() {
    setDraft({ code: '', name: '', warehouseId: WAREHOUSES[0].id, endpointId: freeEndpoints[0]?.id ?? '' })
    setError(null)
  }

  function save() {
    if (!draft) return
    const code = draft.code.trim().toUpperCase()
    if (!code || !draft.name.trim() || !draft.endpointId) {
      setError('Code, name and endpoint are required.')
      return
    }
    if (locations.some((location) => location.warehouseId === draft.warehouseId && location.code === code)) {
      setError('This code already exists in the selected warehouse.')
      return
    }
    const warehouse = WAREHOUSES.find((item) => item.id === draft.warehouseId)
    const endpoint = ENDPOINT_OPTIONS.find((item) => item.id === draft.endpointId)
    setLocations((current) => [
      ...current,
      {
        id: `draft-location-${current.length + 1}`,
        warehouseId: draft.warehouseId,
        warehouseName: warehouse?.name ?? '—',
        endpointId: draft.endpointId,
        endpointCode: endpoint?.code ?? '—',
        endpointName: endpoint?.name ?? '—',
        code,
        name: draft.name.trim(),
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ])
    setDraft(null)
  }

  function toggle(id: string) {
    setLocations((current) => current.map((location) => (location.id === id ? { ...location, isActive: !location.isActive } : location)))
  }

  return (
    <>
      <SectionHead title="Storage locations" hint="Places where Containers are stored. Each one points at one map Endpoint.">
        <AddButton onClick={open}>Add location</AddButton>
      </SectionHead>

      <Table>
        <thead>
          <tr>
            <Th>Code</Th>
            <Th>Name</Th>
            <Th>Warehouse</Th>
            <Th>Endpoint</Th>
            <Th>Status</Th>
            <Th align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {locations.map((location) => (
            <Tr key={location.id}>
              <Td className="font-mono text-xs">{location.code}</Td>
              <Td tone="strong">{location.name}</Td>
              <Td tone="faint">{location.warehouseName}</Td>
              <Td>
                {location.endpointName} <span className="font-mono text-xs text-muted">{location.endpointCode}</span>
              </Td>
              <Td>
                <StatusBadge tone={location.isActive ? 'green' : 'grey'} withDot>
                  {location.isActive ? 'Active' : 'Inactive'}
                </StatusBadge>
              </Td>
              <Td>
                <div className="flex justify-end">
                  <Button size="sm" variant={location.isActive ? 'ghost' : 'tonal'} onClick={() => toggle(location.id)}>
                    {location.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      {draft ? (
        <Dialog title="Add storage location" submitLabel="Create location" onClose={() => setDraft(null)} onSubmit={save}>
          <FieldRow>
            <Field label="Code">
              <input
                className={controlClass()}
                value={draft.code}
                maxLength={100}
                onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                autoFocus
              />
            </Field>
            <Field label="Name">
              <input
                className={controlClass()}
                value={draft.name}
                maxLength={100}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>
          </FieldRow>
          <Field label="Warehouse">
            <select
              className={controlClass()}
              value={draft.warehouseId}
              onChange={(event) => setDraft({ ...draft, warehouseId: event.target.value })}
            >
              {WAREHOUSES.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Map endpoint" hint="Each location uses one Endpoint, and an Endpoint can serve only one location.">
            <select
              className={controlClass()}
              value={draft.endpointId}
              onChange={(event) => setDraft({ ...draft, endpointId: event.target.value })}
            >
              {freeEndpoints.length === 0 ? <option value="">No free endpoint</option> : null}
              {freeEndpoints.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.name} ({endpoint.code})
                </option>
              ))}
            </select>
          </Field>
          {error ? <FormError>{error}</FormError> : null}
        </Dialog>
      ) : null}
    </>
  )
}

import { useState } from 'react'
import type { StorageLocationView } from '@/shared/api/contracts'
import { Dialog } from '@/shared/ui/Dialog'
import { ENDPOINT_OPTIONS, WAREHOUSES } from './mock'
import { SectionHead } from './SectionHead'

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
        <button type="button" className="btn btn--blue" onClick={open}>
          + Add location
        </button>
      </SectionHead>

      <table className="mtable">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Warehouse</th>
            <th>Endpoint</th>
            <th>Status</th>
            <th className="is-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {locations.map((location) => (
            <tr key={location.id}>
              <td>{location.code}</td>
              <td className="is-strong">{location.name}</td>
              <td className="is-faint">{location.warehouseName}</td>
              <td className="is-faint">
                {location.endpointName} · {location.endpointCode}
              </td>
              <td>
                <span className={`mpill mpill--${location.isActive ? 'green' : 'grey'}`}>
                  {location.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <div className="mrow-actions">
                  <button
                    type="button"
                    className={`mbtn ${location.isActive ? 'mbtn--danger' : 'mbtn--ok'}`}
                    onClick={() => toggle(location.id)}
                  >
                    {location.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {draft ? (
        <Dialog title="Add storage location" submitLabel="Create location" onClose={() => setDraft(null)} onSubmit={save}>
          <div className="field-row">
            <label className="field">
              Code
              <input value={draft.code} maxLength={100} onChange={(event) => setDraft({ ...draft, code: event.target.value })} autoFocus />
            </label>
            <label className="field">
              Name
              <input value={draft.name} maxLength={100} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
          </div>
          <label className="field">
            Warehouse
            <select value={draft.warehouseId} onChange={(event) => setDraft({ ...draft, warehouseId: event.target.value })}>
              {WAREHOUSES.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Map endpoint
            <select value={draft.endpointId} onChange={(event) => setDraft({ ...draft, endpointId: event.target.value })}>
              {freeEndpoints.length === 0 ? <option value="">No free endpoint</option> : null}
              {freeEndpoints.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.name} · {endpoint.code}
                </option>
              ))}
            </select>
            <small>Each location uses one Endpoint, and an Endpoint can serve only one location.</small>
          </label>
          {error ? <small className="field" style={{ color: 'var(--red-ink)' }}>{error}</small> : null}
        </Dialog>
      ) : null}
    </>
  )
}

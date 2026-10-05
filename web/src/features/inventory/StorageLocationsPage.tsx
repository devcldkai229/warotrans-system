import { useState } from 'react'
import { AdminPage } from '@/app/AdminPage'
import type { StorageLocationView } from '@/shared/api/contracts'
import { Dialog } from '@/shared/ui/Dialog'
import { ENDPOINT_OPTIONS, STORAGE_LOCATIONS, WAREHOUSES } from './mock'

interface LocationDraft {
  code: string
  name: string
  warehouseId: string
  endpointId: string
}

// A StorageLocation is a simple logical place such as "Shelf A" that points at one Navigation Endpoint.
// Aisle/Bay/Level/Bin are not modelled (rules/00), so those columns from the design are not shown.
export function StorageLocationsPage() {
  const [locations, setLocations] = useState<StorageLocationView[]>(STORAGE_LOCATIONS)
  const [draft, setDraft] = useState<LocationDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const active = locations.filter((location) => location.isActive).length
  const usedEndpoints = new Set(locations.map((location) => location.endpointId))
  const freeEndpoints = ENDPOINT_OPTIONS.filter((endpoint) => !usedEndpoints.has(endpoint.id))

  function open() {
    setDraft({
      code: '',
      name: '',
      warehouseId: WAREHOUSES[0].id,
      endpointId: freeEndpoints[0]?.id ?? '',
    })
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
        code,
        name: draft.name.trim(),
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ])
    setDraft(null)
    setError(null)
  }

  return (
    <AdminPage
      title="Storage Location"
      subtitle="Logical storage locations linked to a Navigation Endpoint (StorageLocation)"
      stats={[
        { label: 'Total locations', value: locations.length },
        { label: 'Active', value: active, tone: 'green' },
        { label: 'Inactive', value: locations.length - active, tone: 'muted' },
        { label: 'Warehouses', value: new Set(locations.map((location) => location.warehouseId)).size },
      ]}
    >
      <div className="atoolbar">
        <h2>Locations</h2>
        <button type="button" className="btn btn--blue" onClick={open}>
          + Add Location
        </button>
      </div>

      <table className="atable">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Warehouse</th>
            <th>Endpoint</th>
            <th className="is-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {locations.map((location) => (
            <tr key={location.id}>
              <td>{location.code}</td>
              <td className="is-strong">{location.name}</td>
              <td className="is-faint">{location.warehouseName}</td>
              <td className="is-faint">{location.endpointCode}</td>
              <td className="is-right">
                <span className={`apill apill--${location.isActive ? 'green' : 'grey'}`}>
                  {location.isActive ? 'Active' : 'Inactive'}
                </span>
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
              <input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} autoFocus />
            </label>
            <label className="field">
              Name
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
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
            Navigation endpoint
            <select value={draft.endpointId} onChange={(event) => setDraft({ ...draft, endpointId: event.target.value })}>
              {freeEndpoints.length === 0 ? <option value="">No free endpoint</option> : null}
              {freeEndpoints.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.code}
                </option>
              ))}
            </select>
            <small>Each location uses one Endpoint, and an Endpoint can serve only one location.</small>
          </label>
          {error ? <small className="field" style={{ color: 'var(--red-ink)' }}>{error}</small> : null}
        </Dialog>
      ) : null}
    </AdminPage>
  )
}

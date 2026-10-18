import { useState } from 'react'
import type { StorageLocationView } from '@/shared/api/contracts'
import { Button } from '@/shared/ui/Button'
import { Dialog } from '@/shared/ui/Dialog'
import { Field, FieldRow, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { createLocation, listFreeEndpoints, setLocationStatus, type FreeEndpoint, type LocationListing } from './api'
import { AddButton, SectionHead } from './SectionHead'

interface LocationDraft {
  code: string
  name: string
  endpointId: string
}

type EndpointOptions = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; items: FreeEndpoint[] }

interface LocationsSectionProps {
  listing: LocationListing
  setItems: (update: (current: StorageLocationView[]) => StorageLocationView[]) => void
  loadState: 'loading' | 'ready' | 'error'
}

/**
 * warehouse.storage_locations: a simple logical place such as "Shelf A" that points at exactly one Navigation Endpoint.
 * Aisle/Bay/Level/Bin are not modelled (rules/00). Code is unique per warehouse, an Endpoint serves one location only.
 */
export function LocationsSection({ listing, setItems, loadState }: LocationsSectionProps) {
  const locations = listing.items
  const warehouse = listing.warehouse
  const [draft, setDraft] = useState<LocationDraft | null>(null)
  const [options, setOptions] = useState<EndpointOptions>({ state: 'loading' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function open() {
    if (!warehouse) return
    setDraft({ code: '', name: '', endpointId: '' })
    setError(null)
    setOptions({ state: 'loading' })
    listFreeEndpoints(warehouse.id, new Set(locations.map((location) => location.endpointId)))
      .then((items) => {
        setOptions({ state: 'ready', items })
        setDraft((current) => (current ? { ...current, endpointId: items[0]?.id ?? '' } : current))
      })
      .catch((failure: unknown) =>
        setOptions({ state: 'error', message: failure instanceof Error ? failure.message : 'The endpoints could not be loaded.' }),
      )
  }

  async function save() {
    if (!draft || !warehouse) return
    const code = draft.code.trim().toUpperCase()
    const endpoint = options.state === 'ready' ? options.items.find((item) => item.id === draft.endpointId) : undefined
    if (!code || !draft.name.trim() || !endpoint) {
      setError('Code, name and endpoint are required.')
      return
    }
    if (locations.some((location) => location.code === code)) {
      setError('This code already exists in this warehouse.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const created = await createLocation(warehouse, endpoint, { code, name: draft.name.trim() })
      setItems((current) => [...current, created].sort((a, b) => a.code.localeCompare(b.code)))
      setNotice(null)
      setDraft(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The location could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(location: StorageLocationView) {
    setBusyId(location.id)
    setNotice(null)
    try {
      const updated = await setLocationStatus(location, !location.isActive)
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (failure) {
      // e.g. "still holds 3 container(s)": the server says why the location cannot be switched off.
      setNotice(failure instanceof Error ? failure.message : 'The status could not be changed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <SectionHead
        title="Storage locations"
        hint={
          warehouse
            ? `Places where Containers are stored in ${warehouse.name}. Each one points at one map Endpoint.`
            : 'Places where Containers are stored. Each one points at one map Endpoint.'
        }
      >
        {warehouse ? <AddButton onClick={open}>Add location</AddButton> : null}
      </SectionHead>

      {notice ? (
        <div className="mb-3">
          <FormError>{notice}</FormError>
        </div>
      ) : null}

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
                  <Button
                    size="sm"
                    variant={location.isActive ? 'ghost' : 'tonal'}
                    disabled={busyId === location.id}
                    onClick={() => toggle(location)}
                  >
                    {location.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </Td>
            </Tr>
          ))}
          {locations.length === 0 ? (
            <EmptyRow colSpan={6}>
              {loadState === 'loading'
                ? 'Loading storage locations…'
                : loadState === 'error'
                  ? 'Could not load storage locations. Check that the API is running, then reload.'
                  : warehouse === null
                    ? 'No active warehouse yet, so there are no storage locations.'
                    : 'No storage locations yet. Add the first one.'}
            </EmptyRow>
          ) : null}
        </tbody>
      </Table>

      {draft && warehouse ? (
        <Dialog title="Add storage location" submitLabel="Create location" busy={busy} onClose={() => setDraft(null)} onSubmit={save}>
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
            <input className={controlClass()} value={warehouse.name} disabled readOnly />
          </Field>
          <Field
            label="Map endpoint"
            hint={
              options.state === 'ready' && options.items.length === 0
                ? 'No free endpoint: every storage endpoint of the published map is used, or no map is published yet.'
                : 'Each location uses one Endpoint of the published map, and an Endpoint can serve only one location.'
            }
          >
            <select
              className={controlClass()}
              value={draft.endpointId}
              disabled={options.state !== 'ready'}
              onChange={(event) => setDraft({ ...draft, endpointId: event.target.value })}
            >
              {options.state === 'loading' ? <option value="">Loading endpoints…</option> : null}
              {options.state === 'error' ? <option value="">Could not load endpoints</option> : null}
              {options.state === 'ready' && options.items.length === 0 ? <option value="">No free endpoint</option> : null}
              {options.state === 'ready'
                ? options.items.map((endpoint) => (
                    <option key={endpoint.id} value={endpoint.id}>
                      {endpoint.name} ({endpoint.code})
                    </option>
                  ))
                : null}
            </select>
          </Field>
          {options.state === 'error' ? <FormError>{options.message}</FormError> : null}
          {error ? <FormError>{error}</FormError> : null}
        </Dialog>
      ) : null}
    </>
  )
}

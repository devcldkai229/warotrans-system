import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { StorageLocationView } from '@/shared/api/contracts'
import { formatIsoDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Dialog'
import { Field, FieldRow, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { getLocationDetail, listFreeEndpoints, updateLocation, type FreeEndpoint } from './api'
import { ContainerList, DetailFooter, DetailHeading, EditFooter, Facts, failureText, useMayEditWarehouse } from './CatalogDetail'
import { t } from '@/shared/i18n'

interface LocationForm {
  name: string
  endpointId: string
}

/**
 * A storage location: its map Endpoint (and whether that Endpoint is still on the published map), its stock and the
 * Containers standing there. Admins can rename it and move it to another free Endpoint of the published map, which is
 * how a location left on an older map version is fixed. The code cannot change.
 */
export function LocationDetailDialog({
  location,
  locations,
  onSaved,
  onClose,
}: {
  location: StorageLocationView
  locations: StorageLocationView[]
  onSaved: (location: StorageLocationView) => void
  onClose: () => void
}) {
  const mayEdit = useMayEditWarehouse()
  const [form, setForm] = useState<LocationForm | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const detail = useQuery({
    queryKey: ['management-location-detail', location.id, location.endpointId, location.name],
    queryFn: () => getLocationDetail(location),
  })
  const endpoints = useQuery({
    queryKey: ['management-location-endpoints', location.warehouseId, location.id],
    queryFn: () =>
      listFreeEndpoints(location.warehouseId, new Set(locations.filter((other) => other.id !== location.id).map((other) => other.endpointId))),
    enabled: form !== null,
  })

  const info = detail.data
  const onPublishedMap = info?.onPublishedMap ?? true
  const activeTransports = info?.activeTransports ?? 0
  // The current Endpoint is offered even when it belongs to an older map, so a rename alone keeps it.
  const options: FreeEndpoint[] = (() => {
    const free = endpoints.data ?? []
    return free.some((endpoint) => endpoint.id === location.endpointId)
      ? free
      : [{ id: location.endpointId, code: location.endpointCode, name: `${location.endpointName} (${t('old map')})` }, ...free]
  })()

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!form) return
    const endpoint = options.find((option) => option.id === form.endpointId)
    if (!form.name.trim() || !endpoint) {
      setError(t('Name and endpoint are required.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      onSaved(await updateLocation(location, { name: form.name.trim(), endpoint }))
      setForm(null)
    } catch (failure) {
      setError(failureText(failure, t('The location could not be saved.')))
    } finally {
      setBusy(false)
    }
  }

  const endpointChanged = form !== null && form.endpointId !== location.endpointId

  return (
    <Modal title={location.name} subtitle={location.code} onClose={onClose} width="w-[860px]">
      {form ? (
        <form onSubmit={save}>
          <div className="flex flex-col gap-4 px-6 py-5">
            <FieldRow>
              <Field label={t('Code')} hint={t('The code cannot be changed.')}>
                <input className={controlClass()} value={location.code} disabled readOnly />
              </Field>
              <Field label={t('Name')}>
                <input
                  className={controlClass()}
                  value={form.name}
                  maxLength={100}
                  autoFocus
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
            </FieldRow>
            <Field
              label={t('Map endpoint')}
              hint={
                activeTransports > 0
                  ? t('A transport is going to or from this location: the endpoint can change once it finishes.')
                  : t('A free endpoint of the published map. Robots drive to the new endpoint from the next transport on.')
              }
            >
              <select
                className={controlClass()}
                value={form.endpointId}
                disabled={endpoints.isPending || activeTransports > 0}
                onChange={(event) => setForm({ ...form, endpointId: event.target.value })}
              >
                {options.map((endpoint) => (
                  <option key={endpoint.id} value={endpoint.id}>
                    {endpoint.name} ({endpoint.code})
                  </option>
                ))}
              </select>
            </Field>
            {endpoints.isError ? <FormError>{t('The endpoints could not be loaded.')}</FormError> : null}
            {endpointChanged && (info?.heldContainers ?? 0) > 0 ? (
              <p className="text-sm text-ink-2">
                {t('{count} container(s) stand at this location. They stay on it; robots fetch them from the new endpoint.', {
                  count: info?.heldContainers ?? 0,
                })}
              </p>
            ) : null}
            {error ? <FormError>{error}</FormError> : null}
          </div>
          <EditFooter busy={busy} onCancel={() => setForm(null)} />
        </form>
      ) : (
        <>
          <div className="px-6 py-5">
            {!onPublishedMap ? (
              <div className="mb-4 rounded-md bg-amber-soft px-4 py-3 text-sm text-amber-ink">
                {t('This location points at an endpoint of an older map version, so it cannot be chosen as a destination. Edit it and pick an endpoint of the published map.')}
              </div>
            ) : null}
            <Facts
              items={[
                { label: t('Code'), value: <span className="font-mono text-xs">{location.code}</span> },
                { label: t('Warehouse'), value: location.warehouseName },
                {
                  label: t('Endpoint'),
                  value: (
                    <>
                      {location.endpointName} <span className="font-mono text-xs text-muted">{location.endpointCode}</span>
                    </>
                  ),
                },
                {
                  label: t('Map'),
                  value: info ? (
                    <StatusBadge tone={onPublishedMap ? 'green' : 'amber'} withDot>
                      {onPublishedMap ? t('On the published map') : t('Older map version')}
                    </StatusBadge>
                  ) : (
                    '—'
                  ),
                },
                {
                  label: t('Status'),
                  value: (
                    <StatusBadge tone={location.isActive ? 'green' : 'grey'} withDot>
                      {location.isActive ? t('Active') : t('Inactive')}
                    </StatusBadge>
                  ),
                },
                { label: t('Open transports'), value: info ? activeTransports : '—' },
                { label: t('Containers here'), value: info ? info.heldContainers : '—' },
                { label: t('Created'), value: formatIsoDateTime(location.createdAt) },
              ]}
            />

            <DetailHeading>{t('Stock by product')}</DetailHeading>
            <div className="rounded-md border border-outline-soft">
              <Table>
                <thead>
                  <tr>
                    <Th>{t('SKU')}</Th>
                    <Th>{t('Product')}</Th>
                    <Th>{t('Level')}</Th>
                    <Th align="right">{t('Containers')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {(info?.stock ?? []).map((row) => (
                    <Tr key={`${row.productId}-${row.levelNo}`}>
                      <Td className="font-mono text-xs">{row.sku}</Td>
                      <Td tone="strong">{row.productName}</Td>
                      <Td tone="faint">{row.levelNo}</Td>
                      <Td align="right" tone="strong">
                        {row.containerCount}
                      </Td>
                    </Tr>
                  ))}
                  {info && info.stock.length === 0 ? <EmptyRow colSpan={4}>{t('No stock at this location.')}</EmptyRow> : null}
                  {detail.isError ? <EmptyRow colSpan={4}>{t('Could not load the stock.')}</EmptyRow> : null}
                </tbody>
              </Table>
            </div>

            <ContainerList storageLocationId={location.id} />
          </div>
          <DetailFooter>
            <Button variant="ghost" onClick={onClose}>
              {t('Close')}
            </Button>
            {mayEdit ? (
              <Button
                variant="primary"
                onClick={() => {
                  setForm({ name: location.name, endpointId: location.endpointId })
                  setError(null)
                }}
              >
                {t('Edit')}
              </Button>
            ) : null}
          </DetailFooter>
        </>
      )}
    </Modal>
  )
}

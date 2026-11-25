import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getActiveMapVersion, getPlace, listEndpointGroups, listEndpoints } from '@/shared/api/navigation'
import { listWarehouses } from '@/shared/api/warehouses'
import { t } from '@/shared/i18n'
import {
  buildEndpointOptions,
  buildGroupOptions,
  findEndpointOption,
  findOptionByCode,
  type EndpointGroupMapGroup,
  type EndpointMapGroup,
} from './endpointOptions'

const MANUAL = '__manual__'

/** Endpoints of the published map of every active warehouse; a workflow is not tied to one map. */
function usePublishedEndpointOptions() {
  return useQuery({
    queryKey: ['workflows', 'published-map-endpoints'],
    staleTime: 60_000,
    queryFn: async () => {
      const warehouses = (await listWarehouses({ isActive: true, take: 100 })).items
      const groups = await Promise.all(
        warehouses.map(async (w): Promise<EndpointMapGroup | null> => {
          const map = await getActiveMapVersion(w.id)
          if (!map) return null
          return { warehouseCode: w.code, mapCode: map.code, endpoints: await listEndpoints(map.id) }
        }),
      )
      return buildEndpointOptions(groups.filter((g): g is EndpointMapGroup => g !== null))
    },
  })
}

/** EndpointGroups of the published map of every active warehouse. */
function usePublishedGroupOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['workflows', 'published-map-endpoint-groups'],
    staleTime: 60_000,
    enabled,
    queryFn: async () => {
      const warehouses = (await listWarehouses({ isActive: true, take: 100 })).items
      const maps = await Promise.all(
        warehouses.map(async (w): Promise<EndpointGroupMapGroup | null> => {
          const map = await getActiveMapVersion(w.id)
          if (!map) return null
          return { warehouseCode: w.code, mapCode: map.code, groups: await listEndpointGroups(map.id) }
        }),
      )
      return buildGroupOptions(maps.filter((m): m is EndpointGroupMapGroup => m !== null))
    },
  })
}

/** A value that is not on a published map: the place it was on (an older map version), by code. */
function useOlderPlace(id: string, needed: boolean) {
  return useQuery({
    queryKey: ['navigation', 'place', id],
    queryFn: () => getPlace(id),
    enabled: needed && /^[0-9a-f-]{36}$/i.test(id),
    staleTime: 60_000,
    retry: false,
  })
}

/** Shows a configured Endpoint ID as its code and name (read-only views); falls back to the ID itself. */
export function EndpointLabel({ id, group = false }: { id: string; group?: boolean }) {
  const endpoints = usePublishedEndpointOptions()
  const groups = usePublishedGroupOptions(group)
  const options = (group ? groups.data : endpoints.data) ?? []
  const known = findEndpointOption(options, id)
  const older = useOlderPlace(id, !known && options.length > 0)
  const sameCode = findOptionByCode(options, older.data?.code)
  if (known) return <span title={id}>{known.label}</span>
  if (sameCode && older.data) {
    return (
      <span title={id}>
        {sameCode.label} <span className="muted">{t('(set on {map}; same code on the published map)', { map: older.data.mapVersionCode })}</span>
      </span>
    )
  }
  if (older.data) {
    return <span className="endpoint-picker__warn">{t('{code} (from {map}) is not on the published map', { code: older.data.code, map: older.data.mapVersionCode })}</span>
  }
  return <span>{id}</span>
}

interface EndpointValuePickerProps {
  value: unknown
  onChange: (value: string | undefined) => void
  required?: boolean
  ariaLabel?: string
  /** Pick an EndpointGroup (a free member is chosen at run time) instead of one Endpoint. */
  group?: boolean
}

/**
 * Picks a map Endpoint (waypoint, park, charger, …) for a UUID setting by its code and name instead of a pasted ID.
 * "Enter ID…" keeps typing an ID possible; an ID that is not on any published map is shown and flagged.
 */
export function EndpointValuePicker({ value, onChange, required, ariaLabel, group = false }: EndpointValuePickerProps) {
  const endpointQuery = usePublishedEndpointOptions()
  const groupQuery = usePublishedGroupOptions(group)
  const query = group ? groupQuery : endpointQuery
  const current = typeof value === 'string' ? value : ''
  const groups = query.data ?? []
  const known = findEndpointOption(groups, current)
  // Configured while another map version was published: the same code on the published map is what runs.
  const older = useOlderPlace(current, Boolean(current) && !known && !query.isLoading)
  const sameCode = findOptionByCode(groups, older.data?.code)
  const [manual, setManual] = useState(false)

  if (manual || query.isError) {
    return (
      <span className="endpoint-picker">
        <input
          type="text"
          value={current}
          aria-label={ariaLabel}
          placeholder={t('Endpoint ID (UUID)')}
          onChange={(e) => onChange(e.target.value.trim() || undefined)}
        />
        {!query.isError ? (
          <button type="button" className="btn small" onClick={() => setManual(false)}>
            {t('Pick from map')}
          </button>
        ) : (
          <span className="muted">{t('Could not load map endpoints.')}</span>
        )}
      </span>
    )
  }

  return (
    <span className="endpoint-picker">
      <select
        value={current}
        aria-label={ariaLabel}
        disabled={query.isLoading}
        onChange={(e) => {
          if (e.target.value === MANUAL) {
            setManual(true)
            return
          }
          onChange(e.target.value || undefined)
        }}
      >
        <option value="">
          {query.isLoading
            ? t('Loading endpoints…')
            : group
              ? groups.length === 0
                ? t('No endpoint group on the published map')
                : t('Select endpoint group…')
              : required
                ? t('Select endpoint…')
                : t('No endpoint')}
        </option>
        {current && !known && !query.isLoading ? (
          <option value={current}>
            {sameCode && older.data
              ? t('{label} (set on {map}; same code on the published map)', { label: sameCode.label, map: older.data.mapVersionCode })
              : older.data
                ? t('{code} (from {map}) is not on the published map', { code: older.data.code, map: older.data.mapVersionCode })
                : t('Unknown ID {id} (not on a published map)', { id: current })}
          </option>
        ) : null}
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={MANUAL}>{t('Enter ID…')}</option>
      </select>
      {current && !known && !query.isLoading && !sameCode ? (
        <span className="endpoint-picker__warn">
          {older.data
            ? t('Add {code} to the published map (same name) or pick another place.', { code: older.data.code })
            : t('This ID is not on any published map.')}
        </span>
      ) : null}
    </span>
  )
}

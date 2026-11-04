import { useMemo, useState } from 'react'
import { cx } from '@/shared/lib/cx'
import { controlClass } from '@/shared/ui/controlClass'
import { SearchInput } from '@/shared/ui/Field'
import { DIRECT_ENDPOINT_TYPES } from './constants'
import { endpointById, locationById } from './labels'
import type { ComposerData } from './types'

export interface PlaceSelection {
  storageLocationId: string | null
  endpointId: string
  levelNo: number | null
}

interface LocationEndpointPickerProps {
  label: string
  data: ComposerData
  value: PlaceSelection
  onChange: (next: PlaceSelection) => void
  onMapPick?: () => void
  picking?: boolean
  error?: string
}

type Mode = 'location' | 'endpoint'

function placeKeyOf(value: PlaceSelection) {
  return `${value.storageLocationId ?? ''}|${value.endpointId}`
}

function inferredMode(value: PlaceSelection): Mode {
  return value.storageLocationId ? 'location' : 'endpoint'
}

export function LocationEndpointPicker({
  label,
  data,
  value,
  onChange,
  onMapPick,
  picking,
  error,
}: LocationEndpointPickerProps) {
  const placeKey = placeKeyOf(value)
  // Key local UI to the place identity so bulk "Set same source/destination" resets
  // mode + search filter without remounting the card.
  const [modeState, setModeState] = useState({ placeKey, mode: inferredMode(value) })
  const [queryState, setQueryState] = useState({ placeKey, query: '' })
  const mode = modeState.placeKey === placeKey ? modeState.mode : inferredMode(value)
  const query = queryState.placeKey === placeKey ? queryState.query : ''
  const setMode = (next: Mode) => setModeState({ placeKey, mode: next })
  const setQuery = (next: string) => setQueryState({ placeKey, query: next })

  const location = locationById(data, value.storageLocationId)
  const endpoint = endpointById(data, value.endpointId)

  const locations = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return data.storageLocations.filter(
      (item) =>
        item.isActive &&
        (!needle ||
          item.code.toLowerCase().includes(needle) ||
          item.name.toLowerCase().includes(needle) ||
          item.endpointName.toLowerCase().includes(needle)),
    )
  }, [data.storageLocations, query])

  const directEndpoints = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return data.endpoints.filter(
      (item) =>
        item.isEnabled &&
        DIRECT_ENDPOINT_TYPES.has(item.endpointType) &&
        (!needle ||
          item.code.toLowerCase().includes(needle) ||
          item.name.toLowerCase().includes(needle) ||
          item.endpointType.toLowerCase().includes(needle)),
    )
  }, [data.endpoints, query])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium tracking-wide text-muted uppercase">{label}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={cx(
              'rounded-full px-2 py-0.5 text-[10px] font-medium',
              mode === 'location' ? 'bg-blue/15 text-blue' : 'text-muted hover:bg-container-high',
            )}
            onClick={() => setMode('location')}
          >
            Location
          </button>
          <button
            type="button"
            className={cx(
              'rounded-full px-2 py-0.5 text-[10px] font-medium',
              mode === 'endpoint' ? 'bg-blue/15 text-blue' : 'text-muted hover:bg-container-high',
            )}
            onClick={() => setMode('endpoint')}
          >
            Endpoint
          </button>
          {onMapPick ? (
            <button
              type="button"
              className={cx(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                picking ? 'bg-primary text-white' : 'text-muted hover:bg-container-high',
              )}
              onClick={onMapPick}
              title="Pick from map"
            >
              Map
            </button>
          ) : null}
        </div>
      </div>

      {mode === 'location' ? (
        <>
          <SearchInput
            variant="field"
            value={query}
            onChange={setQuery}
            placeholder="Search location"
          />
          <select
            className={controlClass('sm')}
            value={value.storageLocationId ?? ''}
            onChange={(event) => {
              const next = data.storageLocations.find((item) => item.id === event.target.value)
              if (!next) {
                onChange({ storageLocationId: null, endpointId: '', levelNo: null })
                return
              }
              onChange({
                storageLocationId: next.id,
                endpointId: next.endpointId,
                levelNo: value.levelNo ?? next.levelOptions[0] ?? 1,
              })
            }}
          >
            <option value="">Select storage location…</option>
            {locations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
          {location ? (
            <div className="flex items-center gap-2">
              <select
                className={controlClass('sm')}
                value={value.levelNo ?? ''}
                onChange={(event) =>
                  onChange({
                    ...value,
                    levelNo: event.target.value ? Number(event.target.value) : null,
                  })
                }
                aria-label="Level"
              >
                {location.levelOptions.map((level) => (
                  <option key={level} value={level}>
                    Level {level}
                  </option>
                ))}
              </select>
              <p className="truncate text-[11px] text-muted">
                Endpoint: <span className="font-mono text-ink-2">{location.endpointCode}</span>
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <SearchInput
            variant="field"
            value={query}
            onChange={setQuery}
            placeholder="Search endpoint"
          />
          <select
            className={controlClass('sm')}
            value={value.endpointId}
            onChange={(event) => {
              onChange({
                storageLocationId: null,
                endpointId: event.target.value,
                levelNo: null,
              })
            }}
          >
            <option value="">Select endpoint…</option>
            {directEndpoints.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.endpointType}
              </option>
            ))}
          </select>
          {endpoint && !location ? (
            <p className="text-[11px] text-muted">
              Direct endpoint <span className="font-mono text-ink-2">{endpoint.code}</span>
            </p>
          ) : null}
        </>
      )}

      {error ? <p className="text-[11px] text-red-ink">{error}</p> : null}
    </div>
  )
}

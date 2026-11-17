import type { EndpointStorageLocation } from '@/shared/api/contracts'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { t } from '@/shared/i18n'
import { suggestStorageCode } from './storageCode'

interface EndpointStorageFieldProps {
  /** What the saved endpoint already has (from the map detail); undefined for an endpoint not saved yet. */
  current: EndpointStorageLocation | null | undefined
  /** The mark being edited: a code, or null when the endpoint is not marked. */
  code: string | null
  name: string
  isWaypoint: boolean
  isDraft: boolean
  onChange: (code: string | null) => void
}

/**
 * The storage location side of an endpoint in the map editor. A location may only point at an endpoint of the
 * published map, so a mark made in a draft is created when that map is published.
 */
export function EndpointStorageField({ current, code, name, isWaypoint, isDraft, onChange }: EndpointStorageFieldProps) {
  if (current && current.state !== 'PENDING') {
    return (
      <div className="mt-3 rounded-md border border-outline-soft bg-container-high p-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-ink-2">{t('Storage location')}</span>
          {current.isActive ? null : <StatusBadge tone="grey">{t('Inactive')}</StatusBadge>}
        </div>
        <div className="mt-1 text-sm text-ink">
          <span className="font-mono">{current.code}</span> <span className="text-muted">· {current.name}</span>
        </div>
        <p className="mt-1 text-muted">
          {current.state === 'LINKED'
            ? t('Containers dropped here are stored at this location.')
            : t('Kept from the source map: it moves to this endpoint when this map is published.')}
        </p>
      </div>
    )
  }

  if (!isDraft) return null

  if (!isWaypoint) {
    return <p className="mt-3 text-xs text-muted">{t('Only a waypoint can be a storage location.')}</p>
  }

  const marked = code !== null
  return (
    <div className="mt-3 rounded-md border border-outline-soft p-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={marked}
          onChange={(event) => onChange(event.target.checked ? suggestStorageCode(name) : null)}
        />
        {t('Use as a storage location')}
      </label>
      {marked ? (
        <label className="mt-2 flex flex-col gap-1.5 text-xs font-medium text-ink-2">
          {t('Location code')}
          <input
            className={controlClass()}
            value={code}
            maxLength={100}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
          />
          <span className="font-normal text-muted">
            {t('The location is created when this map is published; containers dropped here are then stored on it.')}
          </span>
        </label>
      ) : null}
    </div>
  )
}

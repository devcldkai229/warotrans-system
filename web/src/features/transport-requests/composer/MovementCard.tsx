import { cx } from '@/shared/lib/cx'
import { Button, IconButton } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { controlClass } from '@/shared/ui/controlClass'
import { LocationEndpointPicker } from './LocationEndpointPicker'
import { containerById, movementCollapseLine } from './labels'
import type { ComposerData, MapPickTarget, MovementDraft } from './types'

interface MovementCardProps {
  data: ComposerData
  movement: MovementDraft
  selected: boolean
  collapsed: boolean
  errors?: string[]
  mapPickTarget: MapPickTarget
  activeForMapPick: boolean
  onToggleSelect: () => void
  onToggleCollapse: () => void
  onChange: (next: MovementDraft) => void
  onRemove: () => void
  onMapPick: (target: 'source' | 'destination') => void
}

export function MovementCard({
  data,
  movement,
  selected,
  collapsed,
  errors,
  mapPickTarget,
  activeForMapPick,
  onToggleSelect,
  onToggleCollapse,
  onChange,
  onRemove,
  onMapPick,
}: MovementCardProps) {
  const container = containerById(data, movement.containerId)
  const line = movementCollapseLine(data, movement, container)

  if (collapsed) {
    return (
      <article
        className={cx(
          'flex items-center gap-2 rounded-md bg-surface px-3 py-2 text-xs',
          selected && 'ring-2 ring-blue/40',
        )}
      >
        <input type="checkbox" checked={selected} onChange={onToggleSelect} aria-label={`Select movement ${movement.sequenceNo}`} />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onToggleCollapse}>
          <span className="font-medium">#{movement.sequenceNo}</span>{' '}
          <span className="font-mono">{line.code}</span>
          <span className="ml-2 text-muted">
            {line.from} → {line.to}
          </span>
        </button>
        <IconButton className="size-7" aria-label="Expand" onClick={onToggleCollapse}>
          <Icon name="chevronDown" size={14} />
        </IconButton>
      </article>
    )
  }

  return (
    <article
      className={cx(
        'rounded-md bg-surface p-3',
        selected && 'ring-2 ring-blue/40',
        activeForMapPick && 'ring-2 ring-blue',
      )}
    >
      <header className="mb-3 flex items-center gap-2">
        <input type="checkbox" checked={selected} onChange={onToggleSelect} aria-label={`Select movement ${movement.sequenceNo}`} />
        <span className="text-xs font-medium">#{movement.sequenceNo}</span>
        <span className="font-mono text-xs">{container?.barcode ?? '—'}</span>
        <div className="ml-auto flex items-center gap-1">
          <IconButton className="size-7" aria-label="Collapse" onClick={onToggleCollapse}>
            <Icon name="chevronRight" size={14} className="rotate-90" />
          </IconButton>
          <Button variant="dangerGhost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </header>

      <label className="mb-3 flex flex-col gap-1 text-[10px] font-medium tracking-wide text-muted uppercase">
        Container
        <select
          className={controlClass('sm')}
          value={movement.containerId}
          onChange={(event) => {
            const next = containerById(data, event.target.value)
            if (!next) {
              onChange({ ...movement, containerId: event.target.value, sourceAutoFilled: false })
              return
            }
            onChange({
              ...movement,
              containerId: next.id,
              sourceStorageLocationId: next.currentStorageLocationId,
              sourceEndpointId: next.currentEndpointId ?? '',
              sourceLevelNo: next.currentLevelNo,
              sourceAutoFilled: Boolean(next.currentEndpointId),
            })
          }}
        >
          <option value="">Select container…</option>
          {data.containers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.barcode} · {item.productName}
            </option>
          ))}
        </select>
      </label>

      {movement.sourceAutoFilled ? (
        <p className="mb-2 text-[11px] text-blue">Auto-filled from current container location.</p>
      ) : null}

      <div className="flex flex-col gap-3">
        <LocationEndpointPicker
          label="From"
          data={data}
          value={{
            storageLocationId: movement.sourceStorageLocationId,
            endpointId: movement.sourceEndpointId,
            levelNo: movement.sourceLevelNo,
          }}
          picking={activeForMapPick && mapPickTarget === 'source'}
          onMapPick={() => onMapPick('source')}
          onChange={(place) =>
            onChange({
              ...movement,
              sourceStorageLocationId: place.storageLocationId,
              sourceEndpointId: place.endpointId,
              sourceLevelNo: place.levelNo,
              sourceAutoFilled: false,
            })
          }
        />
        <LocationEndpointPicker
          label="To"
          data={data}
          value={{
            storageLocationId: movement.destinationStorageLocationId,
            endpointId: movement.destinationEndpointId,
            levelNo: movement.destinationLevelNo,
          }}
          picking={activeForMapPick && mapPickTarget === 'destination'}
          onMapPick={() => onMapPick('destination')}
          onChange={(place) =>
            onChange({
              ...movement,
              destinationStorageLocationId: place.storageLocationId,
              destinationEndpointId: place.endpointId,
              destinationLevelNo: place.levelNo,
            })
          }
        />
      </div>

      {errors?.length ? (
        <ul className="mt-2 space-y-0.5">
          {errors.map((error) => (
            <li key={error} className="text-[11px] text-red-ink">
              {error}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}

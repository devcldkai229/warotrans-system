import { containerById, shortPlace } from './labels'
import type { ComposerData, MovementDraft } from './types'

interface GroupedMovementsViewProps {
  data: ComposerData
  movements: MovementDraft[]
}

/** Presentation-only aggregation by source. Not a JobBatchPlan. */
export function GroupedMovementsView({ data, movements }: GroupedMovementsViewProps) {
  const groups = new Map<string, MovementDraft[]>()
  for (const movement of movements) {
    const key = movement.sourceEndpointId || '__none__'
    const list = groups.get(key) ?? []
    list.push(movement)
    groups.set(key, list)
  }

  if (movements.length === 0) {
    return <p className="px-1 text-xs text-muted">No movements yet.</p>
  }

  return (
    <div className="space-y-3">
      {[...groups.entries()].map(([sourceKey, items]) => {
        const sample = items[0]
        const sourceLabel = shortPlace(
          data,
          sample.sourceStorageLocationId,
          sample.sourceEndpointId,
          sample.sourceLevelNo,
        )
        return (
          <section key={sourceKey} className="rounded-md bg-surface p-3">
            <header className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-medium">
                SOURCE <span className="font-mono">{sourceLabel}</span>
              </h3>
              <span className="text-[11px] text-muted">
                {items.length} container{items.length === 1 ? '' : 's'}
              </span>
            </header>
            <ul className="space-y-1.5">
              {items.map((movement) => {
                const container = containerById(data, movement.containerId)
                const dest = shortPlace(
                  data,
                  movement.destinationStorageLocationId,
                  movement.destinationEndpointId,
                  movement.destinationLevelNo,
                )
                return (
                  <li key={movement.localId} className="flex items-center gap-2 text-xs">
                    <span className="text-muted">→</span>
                    <span className="font-mono">{dest}</span>
                    <span className="text-muted">:</span>
                    <span className="font-mono">{container?.barcode ?? '—'}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { cx } from '@/shared/lib/cx'
import { ContainerSelector } from './ContainerSelector'
import { GroupedMovementsView } from './GroupedMovementsView'
import { MovementCard } from './MovementCard'
import { ReviewSummary } from './ReviewSummary'
import { newLocalId } from './labels'
import { validateDraft } from './validateDraft'
import type {
  ComposerContainer,
  ComposerData,
  MapPickTarget,
  MovementDraft,
  MovementViewMode,
  Panel2Mode,
  TransportRequestDraft,
} from './types'

interface MovementBuilderPanelProps {
  data: ComposerData
  draft: TransportRequestDraft
  activeMovementId: string | null
  mapPickTarget: MapPickTarget
  submitting: boolean
  onChange: (next: TransportRequestDraft) => void
  onActiveMovementId: (id: string | null) => void
  onMapPickTarget: (target: MapPickTarget) => void
  onSubmit: () => void
}

function detectShared(movements: MovementDraft[]) {
  const sources = new Map<string, number>()
  const dests = new Map<string, number>()
  for (const movement of movements) {
    if (movement.sourceEndpointId) {
      sources.set(movement.sourceEndpointId, (sources.get(movement.sourceEndpointId) ?? 0) + 1)
    }
    if (movement.destinationEndpointId) {
      dests.set(movement.destinationEndpointId, (dests.get(movement.destinationEndpointId) ?? 0) + 1)
    }
  }
  const sharedSource = [...sources.entries()].find(([, n]) => n > 1)
  const sharedDest = [...dests.entries()].find(([, n]) => n > 1)
  return { sharedSource, sharedDest }
}

export function MovementBuilderPanel({
  data,
  draft,
  activeMovementId,
  mapPickTarget,
  submitting,
  onChange,
  onActiveMovementId,
  onMapPickTarget,
  onSubmit,
}: MovementBuilderPanelProps) {
  const [mode, setMode] = useState<Panel2Mode>('build')
  const [viewMode, setViewMode] = useState<MovementViewMode>('list')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())

  const validation = useMemo(() => validateDraft(draft, data), [draft, data])
  const shared = detectShared(draft.movements)
  const excludeIds = useMemo(() => new Set(draft.movements.map((item) => item.containerId)), [draft.movements])

  function updateMovements(movements: MovementDraft[]) {
    onChange({
      ...draft,
      movements: movements.map((item, index) => ({ ...item, sequenceNo: index + 1 })),
    })
  }

  function addContainers(containers: ComposerContainer[]) {
    const next = [...draft.movements]
    for (const container of containers) {
      next.push({
        localId: newLocalId(),
        sequenceNo: next.length + 1,
        containerId: container.id,
        sourceStorageLocationId: container.currentStorageLocationId,
        sourceEndpointId: container.currentEndpointId ?? '',
        sourceLevelNo: container.currentLevelNo,
        destinationStorageLocationId: null,
        destinationEndpointId: '',
        destinationLevelNo: null,
        sourceAutoFilled: Boolean(container.currentEndpointId),
      })
    }
    updateMovements(next)
    setMode('build')
  }

  function patchMovement(localId: string, next: MovementDraft) {
    updateMovements(draft.movements.map((item) => (item.localId === localId ? next : item)))
  }

  function toggleSelected(localId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(localId)) next.delete(localId)
      else next.add(localId)
      return next
    })
  }

  function applyBulk(kind: 'source' | 'destination' | 'remove') {
    const selected = draft.movements.filter((item) => selectedIds.has(item.localId))
    if (selected.length === 0) return
    if (kind === 'remove') {
      updateMovements(draft.movements.filter((item) => !selectedIds.has(item.localId)))
      setSelectedIds(new Set())
      return
    }
    const template = selected[0]
    updateMovements(
      draft.movements.map((item) => {
        if (!selectedIds.has(item.localId)) return item
        if (kind === 'source') {
          return {
            ...item,
            sourceStorageLocationId: template.sourceStorageLocationId,
            sourceEndpointId: template.sourceEndpointId,
            sourceLevelNo: template.sourceLevelNo,
            sourceAutoFilled: false,
          }
        }
        return {
          ...item,
          destinationStorageLocationId: template.destinationStorageLocationId,
          destinationEndpointId: template.destinationEndpointId,
          destinationLevelNo: template.destinationLevelNo,
        }
      }),
    )
  }

  if (mode === 'selectContainers') {
    return (
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-container animate-panel-in">
        <ContainerSelector
          data={data}
          excludeIds={excludeIds}
          onCancel={() => setMode('build')}
          onAdd={addContainers}
        />
      </aside>
    )
  }

  if (mode === 'review') {
    return (
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-container animate-panel-in">
        <ReviewSummary
          data={data}
          draft={draft}
          submitting={submitting}
          onBack={() => setMode('build')}
          onCreate={onSubmit}
        />
      </aside>
    )
  }

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-container animate-panel-in">
      <header className="shrink-0 space-y-3 border-b border-outline/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium">Transport movements</h2>
            <p className="text-[11px] text-muted">Define what each container should move from and to.</p>
          </div>
          <span className="text-xs tabular-nums text-muted">{draft.movements.length}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="primary" size="sm" onClick={() => setMode('selectContainers')}>
            <Icon name="plus" size={14} /> Add container
          </Button>
          <Button variant="outline" size="sm" title="Barcode scanner not connected" disabled>
            Scan barcode
          </Button>
        </div>
        <div className="flex gap-1 rounded-full bg-surface p-0.5">
          {(['list', 'grouped'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={cx(
                'flex-1 rounded-full px-2 py-1 text-[11px] font-medium',
                viewMode === item ? 'bg-ink text-surface' : 'text-muted hover:text-ink',
              )}
              onClick={() => setViewMode(item)}
            >
              {item === 'list' ? 'Movement list' : 'Grouped view'}
            </button>
          ))}
        </div>
        {selectedIds.size > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            <Button variant="tonal" size="sm" onClick={() => applyBulk('source')}>
              Set same source
            </Button>
            <Button variant="tonal" size="sm" onClick={() => applyBulk('destination')}>
              Set same destination
            </Button>
            <Button variant="dangerGhost" size="sm" onClick={() => applyBulk('remove')}>
              Remove selected
            </Button>
          </div>
        ) : null}
        {shared.sharedSource ? (
          <p className="rounded-md bg-blue-soft/50 px-2.5 py-1.5 text-[11px] text-blue-ink">
            Shared source detected · {shared.sharedSource[1]} containers
          </p>
        ) : null}
        {shared.sharedDest ? (
          <p className="rounded-md bg-blue-soft/50 px-2.5 py-1.5 text-[11px] text-blue-ink">
            Shared destination · {shared.sharedDest[1]} containers
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto px-3 py-3">
        {viewMode === 'grouped' ? (
          <GroupedMovementsView data={data} movements={draft.movements} />
        ) : draft.movements.length === 0 ? (
          <p className="px-1 text-xs text-muted">Add containers to start building movements.</p>
        ) : (
          draft.movements.map((movement) => (
            <div key={movement.localId} onFocus={() => onActiveMovementId(movement.localId)}>
              <MovementCard
                data={data}
                movement={movement}
                selected={selectedIds.has(movement.localId)}
                collapsed={collapsedIds.has(movement.localId)}
                errors={validation.movementErrors[movement.localId]}
                mapPickTarget={mapPickTarget}
                activeForMapPick={activeMovementId === movement.localId && mapPickTarget != null}
                onToggleSelect={() => toggleSelected(movement.localId)}
                onToggleCollapse={() =>
                  setCollapsedIds((current) => {
                    const next = new Set(current)
                    if (next.has(movement.localId)) next.delete(movement.localId)
                    else next.add(movement.localId)
                    return next
                  })
                }
                onChange={(next) => {
                  onActiveMovementId(movement.localId)
                  patchMovement(movement.localId, next)
                }}
                onRemove={() => updateMovements(draft.movements.filter((item) => item.localId !== movement.localId))}
                onMapPick={(target) => {
                  onActiveMovementId(movement.localId)
                  onMapPickTarget(mapPickTarget === target && activeMovementId === movement.localId ? null : target)
                }}
              />
            </div>
          ))
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-outline/60 px-4 py-3">
        <div className="min-w-0 flex-1 text-xs text-muted">
          {draft.movements.length} container{draft.movements.length === 1 ? '' : 's'}
          <span className="mx-1">·</span>
          {draft.movements.length} movement{draft.movements.length === 1 ? '' : 's'}
          {!validation.ok && draft.movements.length > 0 ? (
            <span className="ml-2 text-red-ink">Fix validation</span>
          ) : null}
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={!validation.ok}
          onClick={() => setMode('review')}
        >
          Review request
        </Button>
      </footer>
    </aside>
  )
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { MapCallout, MapMovement } from '@/shared/map/WarehouseMap'
import { MovementBuilderPanel } from './MovementBuilderPanel'
import { RequestSetupPanel } from './RequestSetupPanel'
import { buildComposerMapPreview } from './mapPreview'
import { submitTransportRequest } from './submitTransportRequest'
import { mapsForWarehouse, useTransportRequestComposerData } from './useTransportRequestComposerData'
import {
  draftIsDirty,
  emptyDraft,
  type MapPickTarget,
  type TransportRequestDraft,
} from './types'

export interface ComposerMapState {
  panel2Open: boolean
  focusEndpointIds: string[]
  movements: MapMovement[]
  callouts: MapCallout[]
  uiInset: number
  onEndpointClick?: (id: string) => void
  pickHint: string | null
}

interface TransportRequestComposerProps {
  onClose: () => void
  onSubmitted: (requestCode: string) => void
  onMapState: (state: ComposerMapState) => void
  onBanner?: (message: string | null) => void
}

export function TransportRequestComposer({
  onClose,
  onSubmitted,
  onMapState,
  onBanner,
}: TransportRequestComposerProps) {
  const data = useTransportRequestComposerData()
  const [draft, setDraft] = useState<TransportRequestDraft>(() => {
    const warehouseId = data.warehouses[0]?.id ?? ''
    const maps = mapsForWarehouse(data, warehouseId)
    return { ...emptyDraft(), warehouseId, mapVersionId: maps[0]?.id ?? '' }
  })
  const [activeMovementId, setActiveMovementId] = useState<string | null>(null)
  const [mapPickTarget, setMapPickTarget] = useState<MapPickTarget>(null)
  const [submitting, setSubmitting] = useState(false)

  const showPanel2 = Boolean(draft.workflowId)

  const preview = useMemo(
    () => buildComposerMapPreview(draft, data.endpoints, activeMovementId),
    [draft, data.endpoints, activeMovementId],
  )

  const handleEndpointClick = useCallback(
    (endpointId: string) => {
      if (!mapPickTarget || !activeMovementId) return
      const location = data.storageLocations.find((item) => item.endpointId === endpointId) ?? null
      setDraft((current) => ({
        ...current,
        movements: current.movements.map((movement) => {
          if (movement.localId !== activeMovementId) return movement
          if (mapPickTarget === 'source') {
            return {
              ...movement,
              sourceEndpointId: endpointId,
              sourceStorageLocationId: location?.id ?? null,
              sourceLevelNo: location ? movement.sourceLevelNo ?? location.levelOptions[0] ?? 1 : null,
              sourceAutoFilled: false,
            }
          }
          return {
            ...movement,
            destinationEndpointId: endpointId,
            destinationStorageLocationId: location?.id ?? null,
            destinationLevelNo: location ? movement.destinationLevelNo ?? location.levelOptions[0] ?? 1 : null,
          }
        }),
      }))
      setMapPickTarget(null)
    },
    [mapPickTarget, activeMovementId, data.storageLocations],
  )

  useLayoutEffect(() => {
    onMapState({
      panel2Open: showPanel2,
      focusEndpointIds: preview.focusEndpointIds,
      movements: preview.movements,
      callouts: preview.callouts,
      uiInset: showPanel2 ? 500 : 0,
      onEndpointClick: mapPickTarget ? handleEndpointClick : undefined,
      pickHint: mapPickTarget
        ? `Click an endpoint on the map to set ${mapPickTarget}`
        : null,
    })
  }, [preview, showPanel2, mapPickTarget, handleEndpointClick, onMapState])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (mapPickTarget) {
        event.stopPropagation()
        setMapPickTarget(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mapPickTarget])

  function requestClose() {
    if (draftIsDirty(draft) && !window.confirm('Discard this transport request draft?')) return
    onClose()
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const result = await submitTransportRequest(draft)
      onBanner?.(`Mock created ${result.requestCode} (not persisted).`)
      onSubmitted(result.requestCode)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <RequestSetupPanel
        data={data}
        draft={draft}
        onChange={setDraft}
        onBackToList={requestClose}
        onClose={requestClose}
        onLoadScenario={(next) => {
          setDraft(next)
          setActiveMovementId(next.movements[0]?.localId ?? null)
          setMapPickTarget(null)
          onBanner?.(`Loaded demo scenario (${next.note ?? 'preset'}).`)
        }}
      />
      {showPanel2 ? (
        <MovementBuilderPanel
          data={data}
          draft={draft}
          activeMovementId={activeMovementId}
          mapPickTarget={mapPickTarget}
          submitting={submitting}
          onChange={setDraft}
          onActiveMovementId={setActiveMovementId}
          onMapPickTarget={setMapPickTarget}
          onSubmit={() => void handleSubmit()}
        />
      ) : null}
    </>
  )
}

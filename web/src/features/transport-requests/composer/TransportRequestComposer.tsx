import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/client'
import type { Endpoint } from '@/shared/api/contracts'
import { getMapVersionDetail } from '@/shared/api/navigation'
import type { MapBounds } from '@/shared/lib/mapView'
import { boundsFromMapMeta } from '@/shared/map/mapBounds'
import type { MapCallout, MapMovement } from '@/shared/map/WarehouseMap'
import { MovementBuilderPanel } from './MovementBuilderPanel'
import { RequestSetupPanel } from './RequestSetupPanel'
import { buildComposerMapPreview } from './mapPreview'
import { submitTransportRequest } from './submitTransportRequest'
import { useTransportRequestComposerData } from './useTransportRequestComposerData'
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
  endpoints: Endpoint[]
  bounds: MapBounds | undefined
}

interface TransportRequestComposerProps {
  onClose: () => void
  onSubmitted: (result: { id: string; requestCode: string }) => void
  onMapState: (state: ComposerMapState) => void
  onBanner?: (message: string | null) => void
}

export function TransportRequestComposer({
  onClose,
  onSubmitted,
  onMapState,
  onBanner,
}: TransportRequestComposerProps) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<TransportRequestDraft>(() => emptyDraft())
  const data = useTransportRequestComposerData({
    warehouseId: draft.warehouseId,
    mapVersionId: draft.mapVersionId,
    workflowId: draft.workflowId,
  })

  const [activeMovementId, setActiveMovementId] = useState<string | null>(null)
  const [mapPickTarget, setMapPickTarget] = useState<MapPickTarget>(null)
  const [submitting, setSubmitting] = useState(false)

  const showPanel2 = Boolean(draft.workflowId)

  const mapMetaQuery = useQuery({
    queryKey: ['navigation', 'map-detail', draft.mapVersionId],
    queryFn: () => getMapVersionDetail(draft.mapVersionId),
    enabled: Boolean(draft.mapVersionId),
  })

  const composerBounds = useMemo(() => {
    const version = mapMetaQuery.data
    if (!version || version.imageWidthPixels <= 0 || version.imageHeightPixels <= 0) return undefined
    return boundsFromMapMeta({
      resolution: version.resolution,
      originX: version.originX,
      originY: version.originY,
      originYaw: version.originYaw,
      imageWidthPixels: version.imageWidthPixels,
      imageHeightPixels: version.imageHeightPixels,
    })
  }, [mapMetaQuery.data])

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
            destinationLevelNo: location
              ? movement.destinationLevelNo ?? location.levelOptions[0] ?? 1
              : null,
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
      endpoints: data.endpoints,
      bounds: composerBounds,
    })
  }, [preview, showPanel2, mapPickTarget, handleEndpointClick, onMapState, data.endpoints, composerBounds])

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
      const staffInputTypes = Object.fromEntries(
        data.staffInputFields.map((field) => [field.key, field.dataType]),
      )
      const result = await submitTransportRequest(draft, staffInputTypes)
      await queryClient.invalidateQueries({ queryKey: ['transport-requests'] })
      onBanner?.(`Created ${result.requestCode}`)
      onSubmitted({ id: result.id, requestCode: result.requestCode })
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.errors[0]?.message || error.message || error.code || 'Create failed'
          : error instanceof Error
            ? error.message
            : 'Create failed'
      onBanner?.(message)
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

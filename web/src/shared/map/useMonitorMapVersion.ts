import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getActiveMapVersion,
  getMapVersionDetail,
  listMapVersionsForWarehouse,
  type MapVersionDto,
} from '@/shared/api/navigation'
import { listWarehouses } from '@/shared/api/warehouses'
import { EMPTY_MAP_GEOMETRY, mapDetailToGeometry, type MapVersionGeometry } from './mapVersionGeometry'

const WAREHOUSE_KEY = 'warotrans.monitor.warehouseId'
const MAP_KEY = 'warotrans.monitor.mapVersionId'

function readStored(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function writeStored(key: string, value: string) {
  try {
    if (value) window.localStorage.setItem(key, value)
    else window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export interface UseMonitorMapVersionOptions {
  /** Prefer this warehouse when no stored selection (e.g. selected robot / request). */
  preferredWarehouseId?: string | null
  /** Prefer this map version when set (e.g. request.mapVersionId or robot.currentMapVersionId). */
  preferredMapVersionId?: string | null
  enabled?: boolean
}

export interface MonitorMapVersionState {
  warehouseId: string
  mapVersionId: string
  setWarehouseId: (id: string) => void
  setMapVersionId: (id: string) => void
  warehouses: { id: string; code: string; name: string }[]
  maps: MapVersionDto[]
  activeMapId: string | null
  version: MapVersionDto | null
  geometry: MapVersionGeometry
  isLoading: boolean
  error: Error | null
}

/**
 * Warehouse + MapVersion selection for realtime monitor pages (Fleet, Transport Requests).
 * Defaults to the warehouse's active (PUBLISHED) map; persists choice in localStorage.
 */
export function useMonitorMapVersion(options: UseMonitorMapVersionOptions = {}): MonitorMapVersionState {
  const enabled = options.enabled !== false
  const preferredWarehouseId = options.preferredWarehouseId ?? null
  const preferredMapVersionId = options.preferredMapVersionId ?? null

  const [storedWarehouseId, setStoredWarehouseId] = useState(() => readStored(WAREHOUSE_KEY))
  const [storedMapVersionId, setStoredMapVersionId] = useState(() => readStored(MAP_KEY))
  /** Manual map pick; cleared when preferredMapVersionId changes (follow selection again). */
  const [manualMapVersionId, setManualMapVersionId] = useState<string | null>(null)
  const [seenPreferredMapId, setSeenPreferredMapId] = useState(preferredMapVersionId)

  if (preferredMapVersionId !== seenPreferredMapId) {
    setSeenPreferredMapId(preferredMapVersionId)
    setManualMapVersionId(null)
  }

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ isActive: true, take: 50 }),
    enabled,
  })

  const warehouseItems = warehousesQuery.data?.items

  const warehouseId = useMemo(() => {
    if (!warehouseItems?.length) return ''
    if (preferredWarehouseId && warehouseItems.some((w) => w.id === preferredWarehouseId)) {
      return preferredWarehouseId
    }
    if (storedWarehouseId && warehouseItems.some((w) => w.id === storedWarehouseId)) {
      return storedWarehouseId
    }
    return warehouseItems[0].id
  }, [warehouseItems, storedWarehouseId, preferredWarehouseId])

  const mapsQuery = useQuery({
    queryKey: ['navigation', 'maps', warehouseId],
    queryFn: () => listMapVersionsForWarehouse(warehouseId),
    enabled: enabled && Boolean(warehouseId),
  })

  const activeMapQuery = useQuery({
    queryKey: ['navigation', 'active-map', warehouseId],
    queryFn: () => getActiveMapVersion(warehouseId),
    enabled: enabled && Boolean(warehouseId),
  })

  const mapItems = mapsQuery.data
  const activeMapId = activeMapQuery.data?.id ?? null

  const mapVersionId = useMemo(() => {
    if (!mapItems?.length) return ''
    if (manualMapVersionId && mapItems.some((m) => m.id === manualMapVersionId)) {
      return manualMapVersionId
    }
    if (preferredMapVersionId && mapItems.some((m) => m.id === preferredMapVersionId)) {
      return preferredMapVersionId
    }
    if (storedMapVersionId && mapItems.some((m) => m.id === storedMapVersionId)) {
      return storedMapVersionId
    }
    if (activeMapId && mapItems.some((m) => m.id === activeMapId)) return activeMapId
    const published = mapItems.find((m) => m.status === 'PUBLISHED')
    if (published) return published.id
    return mapItems[0].id
  }, [mapItems, storedMapVersionId, activeMapId, preferredMapVersionId, manualMapVersionId])

  const detailQuery = useQuery({
    queryKey: ['navigation', 'map-detail', mapVersionId],
    queryFn: () => getMapVersionDetail(mapVersionId),
    enabled: enabled && Boolean(mapVersionId),
  })

  const geometry = useMemo(
    () => mapDetailToGeometry(detailQuery.data),
    [detailQuery.data],
  )

  const version = useMemo(
    () => mapItems?.find((m) => m.id === mapVersionId) ?? detailQuery.data ?? null,
    [mapItems, mapVersionId, detailQuery.data],
  )

  const warehouses = useMemo(
    () => (warehouseItems ?? []).map((w) => ({ id: w.id, code: w.code, name: w.name })),
    [warehouseItems],
  )

  function setWarehouseId(id: string) {
    setStoredWarehouseId(id)
    writeStored(WAREHOUSE_KEY, id)
    setStoredMapVersionId('')
    writeStored(MAP_KEY, '')
    setManualMapVersionId(null)
  }

  function setMapVersionId(id: string) {
    setStoredMapVersionId(id)
    writeStored(MAP_KEY, id)
    setManualMapVersionId(id)
  }

  return {
    warehouseId,
    mapVersionId,
    setWarehouseId,
    setMapVersionId,
    warehouses,
    maps: mapItems ?? [],
    activeMapId,
    version,
    geometry: mapVersionId ? geometry : EMPTY_MAP_GEOMETRY,
    isLoading:
      enabled &&
      (warehousesQuery.isLoading ||
        (Boolean(warehouseId) && mapsQuery.isLoading) ||
        (Boolean(mapVersionId) && detailQuery.isLoading)),
    error: (detailQuery.error ?? mapsQuery.error ?? warehousesQuery.error) as Error | null,
  }
}

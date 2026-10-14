import { useEffect, useMemo, useState } from 'react'
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
  const [storedWarehouseId, setStoredWarehouseId] = useState(() => readStored(WAREHOUSE_KEY))
  const [storedMapVersionId, setStoredMapVersionId] = useState(() => readStored(MAP_KEY))
  /** When set, overrides stored map until the user picks another map manually. */
  const [followPreferredMap, setFollowPreferredMap] = useState(true)

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ isActive: true, take: 50 }),
    enabled,
  })

  const warehouses = warehousesQuery.data?.items ?? []

  const warehouseId = useMemo(() => {
    if (!warehouses.length) return ''
    const preferred = options.preferredWarehouseId
    if (preferred && warehouses.some((w) => w.id === preferred)) return preferred
    if (storedWarehouseId && warehouses.some((w) => w.id === storedWarehouseId)) return storedWarehouseId
    return warehouses[0].id
  }, [warehouses, storedWarehouseId, options.preferredWarehouseId])

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

  const maps = mapsQuery.data ?? []
  const activeMapId = activeMapQuery.data?.id ?? null

  const mapVersionId = useMemo(() => {
    if (!maps.length) return ''
    const preferred = options.preferredMapVersionId
    if (followPreferredMap && preferred && maps.some((m) => m.id === preferred)) {
      return preferred
    }
    if (storedMapVersionId && maps.some((m) => m.id === storedMapVersionId)) {
      return storedMapVersionId
    }
    if (activeMapId && maps.some((m) => m.id === activeMapId)) return activeMapId
    const published = maps.find((m) => m.status === 'PUBLISHED')
    if (published) return published.id
    return maps[0].id
  }, [maps, storedMapVersionId, activeMapId, options.preferredMapVersionId, followPreferredMap])

  // When preferred map changes (select another request/robot), resume following it.
  useEffect(() => {
    if (options.preferredMapVersionId) setFollowPreferredMap(true)
  }, [options.preferredMapVersionId])

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
    () => maps.find((m) => m.id === mapVersionId) ?? detailQuery.data ?? null,
    [maps, mapVersionId, detailQuery.data],
  )

  function setWarehouseId(id: string) {
    setStoredWarehouseId(id)
    writeStored(WAREHOUSE_KEY, id)
    setStoredMapVersionId('')
    writeStored(MAP_KEY, '')
    setFollowPreferredMap(false)
  }

  function setMapVersionId(id: string) {
    setStoredMapVersionId(id)
    writeStored(MAP_KEY, id)
    setFollowPreferredMap(false)
  }

  return {
    warehouseId,
    mapVersionId,
    setWarehouseId,
    setMapVersionId,
    warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
    maps,
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

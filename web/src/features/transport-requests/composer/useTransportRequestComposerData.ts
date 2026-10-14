import { useMemo } from 'react'
import {
  COMPOSER_CONTAINERS,
  COMPOSER_ENDPOINTS,
  COMPOSER_MAPS,
  COMPOSER_REQUESTED_BY,
  COMPOSER_STORAGE_LOCATIONS,
  COMPOSER_WAREHOUSES,
  COMPOSER_WORKFLOWS,
} from './fixtures'
import type { ComposerData } from './types'

/**
 * Fixture-backed data for the composer.
 * TODO(backend): swap internals for warehouse/map/workflow/container API reads.
 */
export function useTransportRequestComposerData(): ComposerData {
  return useMemo(
    () => ({
      warehouses: COMPOSER_WAREHOUSES,
      maps: COMPOSER_MAPS,
      workflows: COMPOSER_WORKFLOWS,
      containers: COMPOSER_CONTAINERS,
      storageLocations: COMPOSER_STORAGE_LOCATIONS,
      endpoints: COMPOSER_ENDPOINTS,
      requestedByName: COMPOSER_REQUESTED_BY,
    }),
    [],
  )
}

export function mapsForWarehouse(data: ComposerData, warehouseId: string) {
  return data.maps.filter((map) => map.warehouseId === warehouseId && map.status === 'PUBLISHED')
}

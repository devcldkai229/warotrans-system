import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/authContext'
import { listMapVersionsForWarehouse, getMapVersionDetail } from '@/shared/api/navigation'
import { listWarehouses, listContainers, listStorageLocations } from '@/shared/api/warehouses'
import { getWorkflowRequestInputSchema, listWorkflows } from '@/shared/api/workflows'
import type { ContainerStatus, Endpoint, MapStatus, MapVersion } from '@/shared/api/contracts'
import type { ContainerListItem } from '@/shared/api/warehouses'
import { workflowKindOf, type ComposerContainer, type ComposerData, type ComposerStorageLocation, type ComposerWorkflow } from './types'

const DEFAULT_LEVELS = [1, 2, 3, 4]

export function useTransportRequestComposerData(options: {
  warehouseId: string
  mapVersionId: string
  workflowId: string
  /** Containers a prefilled draft already uses (e.g. a stock voucher's), kept selectable beside the fetched page. */
  extraContainers?: ComposerContainer[]
}): ComposerData {
  const { account } = useAuth()
  const [containerSearch, setContainerSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(containerSearch.trim()), 250)
    return () => window.clearTimeout(handle)
  }, [containerSearch])

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ isActive: true, take: 50 }),
  })

  const mapsQuery = useQuery({
    queryKey: ['navigation', 'maps', options.warehouseId],
    queryFn: () => listMapVersionsForWarehouse(options.warehouseId),
    enabled: Boolean(options.warehouseId),
  })

  const mapDetailQuery = useQuery({
    queryKey: ['navigation', 'map-detail', options.mapVersionId],
    queryFn: () => getMapVersionDetail(options.mapVersionId),
    enabled: Boolean(options.mapVersionId),
  })

  const workflowsQuery = useQuery({
    queryKey: ['workflows', 'published'],
    queryFn: () => listWorkflows({ status: 'PUBLISHED' }),
  })

  const schemaQuery = useQuery({
    queryKey: ['workflows', 'request-input-schema', options.workflowId],
    queryFn: () => getWorkflowRequestInputSchema(options.workflowId),
    enabled: Boolean(options.workflowId),
  })

  const locationsQuery = useQuery({
    queryKey: ['warehouse', 'storage-locations', options.warehouseId],
    queryFn: () => listStorageLocations({ warehouseId: options.warehouseId, activeOnly: true }),
    enabled: Boolean(options.warehouseId),
  })

  const containersQuery = useQuery({
    queryKey: ['warehouse', 'containers', options.warehouseId, debouncedSearch],
    queryFn: () =>
      listContainers({
        warehouseId: options.warehouseId,
        search: debouncedSearch || undefined,
        eligibleOnly: true,
        take: 50,
      }),
    enabled: Boolean(options.warehouseId),
  })

  // INBOUND offers the containers of confirmed phiếu nhập first, OUTBOUND those of confirmed phiếu xuất (newest first).
  const workflowKind = workflowKindOf(workflowsQuery.data?.items.find((item) => item.id === options.workflowId)?.code)
  const voucherType = workflowKind === 'INBOUND' || workflowKind === 'OUTBOUND' ? workflowKind : undefined
  const voucherContainersQuery = useQuery({
    queryKey: ['warehouse', 'containers', 'by-voucher', options.warehouseId, voucherType, debouncedSearch],
    queryFn: () =>
      listContainers({
        warehouseId: options.warehouseId,
        search: debouncedSearch || undefined,
        eligibleOnly: true,
        voucherType,
        take: 100,
      }),
    enabled: Boolean(options.warehouseId) && Boolean(voucherType),
  })

  const endpoints: Endpoint[] = useMemo(() => {
    const items = mapDetailQuery.data?.endpoints ?? []
    return items.map((item) => ({
      id: item.id,
      mapVersionId: item.mapVersionId,
      code: item.code,
      name: item.name,
      endpointType: item.endpointType as Endpoint['endpointType'],
      x: item.x,
      y: item.y,
      yaw: item.yaw,
      positionTolerance: item.positionTolerance,
      yawTolerance: item.yawTolerance,
      isEnabled: item.isEnabled,
    }))
  }, [mapDetailQuery.data])

  const endpointById = useMemo(() => new Map(endpoints.map((item) => [item.id, item])), [endpoints])

  const maps: MapVersion[] = useMemo(
    () =>
      (mapsQuery.data ?? []).map((item) => ({
        id: item.id,
        warehouseId: item.warehouseId,
        versionNo: item.versionNo,
        name: item.name,
        status: item.status as MapStatus,
        createdAt: item.createdAt,
        publishedAt: item.publishedAt,
      })),
    [mapsQuery.data],
  )

  const storageLocations: ComposerStorageLocation[] = useMemo(
    () =>
      (locationsQuery.data?.items ?? []).map((item) => {
        const endpoint = endpointById.get(item.endpointId)
        return {
          id: item.id,
          warehouseId: item.warehouseId,
          code: item.code,
          name: item.name,
          endpointId: item.endpointId,
          endpointCode: endpoint?.code ?? '',
          endpointName: endpoint?.name ?? '',
          isActive: item.isActive,
          levelOptions: DEFAULT_LEVELS,
        }
      }),
    [locationsQuery.data, endpointById],
  )

  const { extraContainers } = options
  const containers: ComposerContainer[] = useMemo(() => {
    const seen = new Set<string>()
    const listed: ContainerListItem[] = []
    for (const item of [...(voucherType ? voucherContainersQuery.data?.items ?? [] : []), ...(containersQuery.data?.items ?? [])]) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      listed.push(item)
    }
    const fetched = listed.map((item) => {
      const endpoint = item.currentEndpointId ? endpointById.get(item.currentEndpointId) : undefined
      return {
        id: item.id,
        barcode: item.barcode,
        productName: item.productName,
        sku: item.productSku,
        status: item.status as ContainerStatus,
        currentStorageLocationId: item.currentStorageLocationId,
        currentLocationCode: item.currentStorageLocationCode,
        currentLocationName: item.currentStorageLocationCode,
        currentLevelNo: item.currentLevelNo,
        currentEndpointId: item.currentEndpointId,
        currentEndpointCode: endpoint?.code ?? null,
        currentEndpointName: endpoint?.name ?? null,
        voucher: item.voucher ?? null,
      }
    })
    const fetchedIds = new Set(fetched.map((item) => item.id))
    const extras = (extraContainers ?? [])
      .filter((item) => !fetchedIds.has(item.id))
      .map((item) => {
        const endpoint = item.currentEndpointId ? endpointById.get(item.currentEndpointId) : undefined
        return { ...item, currentEndpointCode: endpoint?.code ?? null, currentEndpointName: endpoint?.name ?? null }
      })
    return [...extras, ...fetched]
  }, [containersQuery.data, voucherContainersQuery.data, voucherType, endpointById, extraContainers])

  const workflows: ComposerWorkflow[] = useMemo(
    () =>
      (workflowsQuery.data?.items ?? []).map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        versionNo: item.versionNo,
        cardSummary: item.description?.trim() || `${item.code} · v${item.versionNo}`,
        status: item.status,
      })),
    [workflowsQuery.data],
  )

  const staffInputFields = useMemo(() => {
    const fields = schemaQuery.data?.workflowInputs ?? []
    return fields.filter((field) => !['containerId', 'source', 'destination', 'details'].some((key) =>
      field.key === key || field.key.startsWith(`${key}.`),
    ))
  }, [schemaQuery.data])

  const isLoading =
    warehousesQuery.isLoading ||
    (Boolean(options.warehouseId) && mapsQuery.isLoading) ||
    (Boolean(options.mapVersionId) && mapDetailQuery.isLoading) ||
    workflowsQuery.isLoading

  const error =
    (warehousesQuery.error as Error | null)?.message ??
    (mapsQuery.error as Error | null)?.message ??
    (mapDetailQuery.error as Error | null)?.message ??
    (workflowsQuery.error as Error | null)?.message ??
    (schemaQuery.error as Error | null)?.message ??
    (locationsQuery.error as Error | null)?.message ??
    (containersQuery.error as Error | null)?.message ??
    null

  return {
    warehouses: (warehousesQuery.data?.items ?? []).map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
    })),
    maps,
    workflows,
    staffInputFields,
    containers,
    workflowKind,
    storageLocations,
    endpoints,
    requestedByName: account?.fullName ?? account?.username ?? '—',
    isLoading,
    error,
    containerSearch,
    setContainerSearch,
  }
}

export function mapsForWarehouse(data: Pick<ComposerData, 'maps'>, warehouseId: string) {
  return data.maps.filter((map) => map.warehouseId === warehouseId && map.status === 'PUBLISHED')
}

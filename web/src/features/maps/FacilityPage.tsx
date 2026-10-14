import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MapStatus } from '@/shared/api/contracts'
import {
  importMapVersion,
  listMapVersionsForWarehouse,
  publishMapVersion,
  resolveMapAssetUrl,
  type MapVersionDto,
} from '@/shared/api/navigation'
import { listWarehouses } from '@/shared/api/warehouses'
import { ApiError } from '@/shared/api/client'
import { cx } from '@/shared/lib/cx'
import { Button, IconButton } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { MAP_STATUS_TONE } from '@/shared/ui/statusTones'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { formatDateTime } from '@/shared/lib/format'
import { WarehouseMap } from '@/shared/map/WarehouseMap'
import { boundsFromMapMeta } from '@/shared/map/mapBounds'
import { DEFAULT_MAP_BOUNDS } from '@/shared/lib/mapView'

interface MapCardProps {
  version: MapVersionDto
  warehouseName: string
  when: string
  children: ReactNode
}

function MapCard({ version, warehouseName, when, children }: MapCardProps) {
  const tint =
    version.status === 'DRAFT'
      ? 'border-amber/40 bg-amber-soft/50'
      : version.status === 'PUBLISHED'
        ? 'border-green/40 bg-green-soft/50'
        : 'border-outline-soft bg-container'

  const preview = resolveMapAssetUrl(version.previewImageUri)
  const bounds =
    version.imageWidthPixels > 0 && version.imageHeightPixels > 0
      ? boundsFromMapMeta({
          resolution: version.resolution,
          originX: version.originX,
          originY: version.originY,
          originYaw: version.originYaw,
          imageWidthPixels: version.imageWidthPixels,
          imageHeightPixels: version.imageHeightPixels,
        })
      : DEFAULT_MAP_BOUNDS

  return (
    <article className={cx('overflow-hidden rounded-lg border shadow-float', tint)}>
      <div className="relative h-64 bg-container/60">
        <div className="absolute inset-x-0 top-4 bottom-0">
          <WarehouseMap
            zones={[]}
            edges={[]}
            endpoints={[]}
            bounds={bounds}
            occupancyImageUrl={preview}
            layers={{ legend: false, controls: false, coordinates: false, robots: false }}
            labels="none"
          />
        </div>
        <StatusBadge tone={MAP_STATUS_TONE[version.status as MapStatus] ?? 'grey'} withDot surface className="absolute top-4 left-4 shadow-float">
          {version.status}
        </StatusBadge>
      </div>
      <div className="flex items-end justify-between gap-4 border-t border-outline-soft bg-surface/70 p-6">
        <div>
          <h3 className="text-md font-book">
            {warehouseName}, {version.code}
          </h3>
          <p className="mt-1 text-sm text-ink-2">{when}</p>
          <p className="mt-0.5 text-xs text-muted">v{version.versionNo} · {version.name}</p>
        </div>
        <div className="flex gap-2">{children}</div>
      </div>
    </article>
  )
}

function MissingMapCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="flex min-h-60 flex-col justify-end rounded-lg border border-dashed border-outline bg-container p-6">
      <h3 className="text-md font-book">{title}</h3>
      <p className="mt-1 text-sm text-ink-2">{children}</p>
    </article>
  )
}

export function FacilityPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileYamlRef = useRef<HTMLInputElement>(null)
  const filePgmRef = useRef<HTMLInputElement>(null)
  const [importName, setImportName] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [pendingYaml, setPendingYaml] = useState<File | null>(null)
  const [pendingPgm, setPendingPgm] = useState<File | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ isActive: true, take: 50 }),
  })

  const warehouse = warehousesQuery.data?.items[0]
  const warehouseId = warehouse?.id

  const mapsQuery = useQuery({
    queryKey: ['navigation', 'maps', warehouseId],
    queryFn: () => listMapVersionsForWarehouse(warehouseId!),
    enabled: Boolean(warehouseId),
  })

  const maps = mapsQuery.data ?? []
  const draft = maps.find((m) => m.status === 'DRAFT')
  const published = maps.find((m) => m.status === 'PUBLISHED')
  const warehouseName = warehouse?.name ?? warehouse?.code ?? 'Warehouse'

  const publishMutation = useMutation({
    mutationFn: (id: string) => publishMapVersion(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['navigation', 'maps', warehouseId] })
    },
  })

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!warehouseId || !pendingYaml || !pendingPgm) {
        throw new Error('Select a warehouse and both yaml + pgm files.')
      }
      return importMapVersion(warehouseId, pendingYaml, pendingPgm, importName || undefined)
    },
    onSuccess: async () => {
      setImportOpen(false)
      setPendingYaml(null)
      setPendingPgm(null)
      setImportName('')
      setImportError(null)
      await queryClient.invalidateQueries({ queryKey: ['navigation', 'maps', warehouseId] })
    },
    onError: (err) => {
      setImportError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Import failed')
    },
  })

  function onPickYaml(event: ChangeEvent<HTMLInputElement>) {
    setPendingYaml(event.target.files?.[0] ?? null)
  }

  function onPickPgm(event: ChangeEvent<HTMLInputElement>) {
    setPendingPgm(event.target.files?.[0] ?? null)
  }

  if (warehousesQuery.isLoading || (warehouseId && mapsQuery.isLoading)) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">Loading facility maps…</div>
    )
  }

  if (!warehouseId) {
    return (
      <div className="mx-auto max-w-[1500px] px-10 pt-8 pb-16">
        <h1 className="text-4xl font-book">Facility</h1>
        <p className="mt-3 text-base text-ink-2">Create an active warehouse before importing maps.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1500px] px-10 pt-8 pb-16">
        <h1 className="text-4xl font-book">Facility</h1>
        <p className="mt-3 text-base text-ink-2">
          The map robots navigate by: import a ROS occupancy map, edit the draft, then publish it.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-4">
          {draft ? (
            <MapCard
              version={draft}
              warehouseName={warehouseName}
              when={`Created ${formatDateTime(draft.createdAt)}`}
            >
              <Button
                variant="surface"
                disabled={publishMutation.isPending}
                onClick={() => publishMutation.mutate(draft.id)}
              >
                Publish map
              </Button>
              <Button variant="primary" onClick={() => navigate(`/configure/facility/maps/${draft.id}/edit`)}>
                Edit
              </Button>
            </MapCard>
          ) : (
            <MissingMapCard title="No draft map">Import a yaml + pgm pair to create a draft MapVersion.</MissingMapCard>
          )}

          {published ? (
            <MapCard
              version={published}
              warehouseName={warehouseName}
              when={`Published ${formatDateTime(published.publishedAt)}`}
            >
              <Button variant="surface" onClick={() => navigate(`/configure/facility/maps/${published.id}/edit`)}>
                View
              </Button>
            </MapCard>
          ) : (
            <MissingMapCard title="No published map">Robots cannot navigate until a map version is published.</MissingMapCard>
          )}
        </div>

        <header className="mt-14 mb-4 flex items-center justify-between">
          <h2 className="text-xl font-book">Map versions</h2>
          <div className="flex items-center gap-2">
            <IconButton aria-label="Search maps">
              <Icon name="search" size={16} />
            </IconButton>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Icon name="upload" size={15} /> Import
            </Button>
          </div>
        </header>

        {importOpen ? (
          <div className="mb-6 rounded-lg border border-outline-soft bg-surface p-5 shadow-float">
            <h3 className="text-md font-book">Import ROS map (yaml + pgm)</h3>
            <p className="mt-1 text-sm text-ink-2">Creates a DRAFT MapVersion with preview PNG under /map-assets.</p>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="text-sm">
                Name
                <input
                  className="mt-1 block w-64 rounded border border-outline-soft bg-container px-3 py-2"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  placeholder="Optional display name"
                />
              </label>
              <label className="text-sm">
                map.yaml
                <input ref={fileYamlRef} type="file" accept=".yaml,.yml" className="mt-1 block" onChange={onPickYaml} />
              </label>
              <label className="text-sm">
                map.pgm
                <input ref={filePgmRef} type="file" accept=".pgm" className="mt-1 block" onChange={onPickPgm} />
              </label>
              <Button
                variant="primary"
                disabled={!pendingYaml || !pendingPgm || importMutation.isPending}
                onClick={() => importMutation.mutate()}
              >
                {importMutation.isPending ? 'Importing…' : 'Import'}
              </Button>
              <Button variant="ghost" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
            </div>
            {importError ? <p className="mt-3 text-sm text-red">{importError}</p> : null}
          </div>
        ) : null}

        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Version</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th>Published</Th>
              <Th>Name</Th>
            </tr>
          </thead>
          <tbody>
            {maps.length === 0 ? (
              <EmptyRow colSpan={6}>No map versions yet. Import a yaml + pgm to begin.</EmptyRow>
            ) : (
              maps.map((version) => (
                <Tr key={version.id}>
                  <Td tone="strong">
                    <button
                      type="button"
                      className="text-left font-medium text-ink hover:underline"
                      onClick={() => navigate(`/configure/facility/maps/${version.id}/edit`)}
                    >
                      {version.code}
                    </button>
                  </Td>
                  <Td className="tabular-nums">v{version.versionNo}</Td>
                  <Td>
                    <StatusBadge tone={MAP_STATUS_TONE[version.status as MapStatus] ?? 'grey'}>
                      {version.status}
                    </StatusBadge>
                  </Td>
                  <Td className="tabular-nums">{formatDateTime(version.createdAt)}</Td>
                  <Td className="tabular-nums">{version.publishedAt ? formatDateTime(version.publishedAt) : '—'}</Td>
                  <Td className="max-w-80 truncate">{version.name}</Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </div>
  )
}

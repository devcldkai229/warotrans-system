import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MapStatus } from '@/shared/api/contracts'
import {
  archiveMapVersion,
  createMapVersion,
  fetchSampleMapFiles,
  getActiveMapVersion,
  importMapVersion,
  listMapVersionsForWarehouse,
  publishMapVersion,
  resolveMapAssetUrl,
  updateMapVersion,
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
import { controlClass } from '@/shared/ui/controlClass'

const WAREHOUSE_KEY = 'warotrans.facilityWarehouseId'

/** Map Editor needs pixel size from PGM import; Create-metadata-only leaves width/height = 0. */
function hasMapImage(version: MapVersionDto) {
  return version.imageWidthPixels > 0 && version.imageHeightPixels > 0
}

interface MapCardProps {
  version: MapVersionDto
  warehouseName: string
  when: string
  active?: boolean
  children: ReactNode
}

function MapCard({ version, warehouseName, when, active, children }: MapCardProps) {
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
        <div className="absolute top-4 left-4 flex flex-wrap gap-2">
          <StatusBadge
            tone={MAP_STATUS_TONE[version.status as MapStatus] ?? 'grey'}
            withDot
            surface
            className="shadow-float"
          >
            {version.status}
          </StatusBadge>
          {active ? (
            <StatusBadge tone="green" withDot surface className="shadow-float">
              Active
            </StatusBadge>
          ) : null}
        </div>
      </div>
      <div className="flex items-end justify-between gap-4 border-t border-outline-soft bg-surface/70 p-6">
        <div>
          <h3 className="text-md font-book">
            {warehouseName}, {version.code}
          </h3>
          <p className="mt-1 text-sm text-ink-2">{when}</p>
          <p className="mt-0.5 text-xs text-muted">
            v{version.versionNo} · {version.name}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">{children}</div>
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

interface MetadataFormState {
  name: string
  resolution: string
  originX: string
  originY: string
  originYaw: string
}

const emptyCreateForm = (): MetadataFormState => ({
  name: '',
  resolution: '0.05',
  originX: '0',
  originY: '0',
  originYaw: '0',
})

function formFromVersion(version: MapVersionDto): MetadataFormState {
  return {
    name: version.name,
    resolution: String(version.resolution),
    originX: String(version.originX),
    originY: String(version.originY),
    originYaw: String(version.originYaw),
  }
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
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<MetadataFormState>(emptyCreateForm)
  const [createError, setCreateError] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<MapVersionDto | null>(null)
  const [editForm, setEditForm] = useState<MetadataFormState>(emptyCreateForm)
  const [editError, setEditError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(() => {
    try {
      return window.localStorage.getItem(WAREHOUSE_KEY) ?? ''
    } catch {
      return ''
    }
  })

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ isActive: true, take: 50 }),
  })

  const warehouses = warehousesQuery.data?.items ?? []
  const warehouseId = useMemo(() => {
    const items = warehousesQuery.data?.items
    if (!items?.length) return ''
    if (selectedWarehouseId && items.some((w) => w.id === selectedWarehouseId)) {
      return selectedWarehouseId
    }
    return items[0].id
  }, [warehousesQuery.data?.items, selectedWarehouseId])

  const warehouse = warehouses.find((w) => w.id === warehouseId) ?? warehouses[0]

  const mapsQuery = useQuery({
    queryKey: ['navigation', 'maps', warehouseId],
    queryFn: () => listMapVersionsForWarehouse(warehouseId!),
    enabled: Boolean(warehouseId),
  })

  const activeMapQuery = useQuery({
    queryKey: ['navigation', 'active-map', warehouseId],
    queryFn: () => getActiveMapVersion(warehouseId!),
    enabled: Boolean(warehouseId),
  })

  const maps = mapsQuery.data ?? []
  const draft = maps.find((m) => m.status === 'DRAFT')
  const published = maps.find((m) => m.status === 'PUBLISHED')
  const activeMap = activeMapQuery.data
  const warehouseName = warehouse?.name ?? warehouse?.code ?? 'Warehouse'

  async function invalidateMaps() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['navigation', 'maps', warehouseId] }),
      queryClient.invalidateQueries({ queryKey: ['navigation', 'active-map', warehouseId] }),
    ])
  }

  const publishMutation = useMutation({
    mutationFn: (id: string) => publishMapVersion(id),
    onSuccess: async () => {
      setActionError(null)
      await invalidateMaps()
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Publish failed')
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveMapVersion(id),
    onSuccess: async () => {
      setActionError(null)
      await invalidateMaps()
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Archive failed')
    },
  })

  const createMutation = useMutation({
    mutationFn: async (form: MetadataFormState) => {
      if (!warehouseId) throw new Error('Select a warehouse.')
      const name = form.name.trim()
      if (!name) throw new Error('Name is required.')
      const resolution = Number(form.resolution)
      const originX = Number(form.originX)
      const originY = Number(form.originY)
      const originYaw = Number(form.originYaw)
      if (!(resolution > 0) || Number.isNaN(originX) || Number.isNaN(originY) || Number.isNaN(originYaw)) {
        throw new Error('Resolution must be > 0; origin values must be numbers.')
      }
      return createMapVersion(warehouseId, {
        name,
        resolution,
        originX,
        originY,
        originYaw,
      })
    },
    onSuccess: async () => {
      setCreateOpen(false)
      setCreateForm(emptyCreateForm())
      setCreateError(null)
      setImportOpen(true)
      setActionError('Draft created. Import map.yaml + map.pgm next — Edit needs image size from the PGM.')
      await invalidateMaps()
    },
    onError: (err) => {
      setCreateError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Create failed')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ version, form }: { version: MapVersionDto; form: MetadataFormState }) => {
      const name = form.name.trim()
      if (!name) throw new Error('Name is required.')
      const resolution = Number(form.resolution)
      const originX = Number(form.originX)
      const originY = Number(form.originY)
      const originYaw = Number(form.originYaw)
      if (!(resolution > 0) || Number.isNaN(originX) || Number.isNaN(originY) || Number.isNaN(originYaw)) {
        throw new Error('Resolution must be > 0; origin values must be numbers.')
      }
      return updateMapVersion(version.id, {
        name,
        mapUri: version.mapUri,
        mapYamlUri: version.mapYamlUri,
        previewImageUri: version.previewImageUri,
        frameId: version.frameId,
        imageWidthPixels: version.imageWidthPixels,
        imageHeightPixels: version.imageHeightPixels,
        resolution,
        originX,
        originY,
        originYaw,
        negate: version.negate,
        occupiedThreshold: version.occupiedThreshold,
        freeThreshold: version.freeThreshold,
        contentHash: version.contentHash,
      })
    },
    onSuccess: async () => {
      setEditTarget(null)
      setEditError(null)
      await invalidateMaps()
    },
    onError: (err) => {
      setEditError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Update failed')
    },
  })

  const importMutation = useMutation({
    mutationFn: async (files: { yaml: File; pgm: File; name?: string }) => {
      if (!warehouseId) throw new Error('Select a warehouse.')
      return importMapVersion(warehouseId, files.yaml, files.pgm, files.name)
    },
    onSuccess: async (created) => {
      setImportOpen(false)
      setPendingYaml(null)
      setPendingPgm(null)
      setImportName('')
      setImportError(null)
      await invalidateMaps()
      navigate(`/configure/facility/maps/${created.id}/edit`)
    },
    onError: (err) => {
      setImportError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Import failed')
    },
  })

  const sampleMutation = useMutation({
    mutationFn: async () => {
      const files = await fetchSampleMapFiles()
      if (!warehouseId) throw new Error('Select a warehouse.')
      return importMapVersion(warehouseId, files.yaml, files.pgm, 'Sample ROS map')
    },
    onSuccess: async (created) => {
      await invalidateMaps()
      navigate(`/configure/facility/maps/${created.id}/edit`)
    },
    onError: (err) => {
      setImportError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Sample import failed')
    },
  })

  function onPickYaml(event: ChangeEvent<HTMLInputElement>) {
    setPendingYaml(event.target.files?.[0] ?? null)
  }

  function onPickPgm(event: ChangeEvent<HTMLInputElement>) {
    setPendingPgm(event.target.files?.[0] ?? null)
  }

  function openEdit(version: MapVersionDto) {
    setEditTarget(version)
    setEditForm(formFromVersion(version))
    setEditError(null)
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
        <p className="mt-3 max-w-xl text-base text-ink-2">
          Facility maps belong to a warehouse. Create an active warehouse in Management, then return here to
          import or create a map version.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => navigate('/management?tab=warehouses')}>
            <Icon name="plus" size={15} /> Create warehouse
          </Button>
          <Button variant="outline" onClick={() => warehousesQuery.refetch()}>
            Refresh
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1500px] px-10 pt-8 pb-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-book">Facility</h1>
            <p className="mt-3 text-base text-ink-2">
              Create a draft map, import ROS assets, edit metadata, publish to activate, or archive old versions.
            </p>
            {activeMap ? (
              <p className="mt-2 text-sm text-ink-2">
                Active map:{' '}
                <button
                  type="button"
                  className="font-medium text-ink hover:underline"
                  onClick={() => navigate(`/configure/facility/maps/${activeMap.id}/edit`)}
                >
                  {activeMap.code}
                </button>{' '}
                · {activeMap.name}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">No active (published) map for this warehouse.</p>
            )}
          </div>
          <label className="text-sm text-ink-2">
            Warehouse
            <select
              className={cx(controlClass(), 'mt-1 block min-w-56')}
              value={warehouseId}
              onChange={(e) => {
                setSelectedWarehouseId(e.target.value)
                try {
                  window.localStorage.setItem(WAREHOUSE_KEY, e.target.value)
                } catch {
                  // ignore
                }
              }}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {actionError ? <p className="mt-4 text-sm text-red">{actionError}</p> : null}

        <div className="mt-10 grid grid-cols-2 gap-4">
          {draft ? (
            <MapCard version={draft} warehouseName={warehouseName} when={`Created ${formatDateTime(draft.createdAt)}`}>
              <Button
                variant="surface"
                disabled={publishMutation.isPending}
                onClick={() => publishMutation.mutate(draft.id)}
              >
                Publish map
              </Button>
              <Button variant="outline" onClick={() => openEdit(draft)}>
                Metadata
              </Button>
              {hasMapImage(draft) ? (
                <Button variant="primary" onClick={() => navigate(`/configure/facility/maps/${draft.id}/edit`)}>
                  Edit
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => {
                    setImportOpen(true)
                    setActionError('Import yaml + pgm first. Create-only drafts have no image size for the editor.')
                  }}
                >
                  Import assets
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={archiveMutation.isPending}
                onClick={() => {
                  if (window.confirm(`Archive draft ${draft.code}?`)) archiveMutation.mutate(draft.id)
                }}
              >
                Archive
              </Button>
            </MapCard>
          ) : (
            <MissingMapCard title="No draft map">
              Create a metadata-only draft or import a yaml + pgm pair.
            </MissingMapCard>
          )}

          {published ? (
            <MapCard
              version={published}
              warehouseName={warehouseName}
              when={`Published ${formatDateTime(published.publishedAt)}`}
              active={activeMap?.id === published.id}
            >
              {hasMapImage(published) ? (
                <Button variant="surface" onClick={() => navigate(`/configure/facility/maps/${published.id}/edit`)}>
                  View
                </Button>
              ) : null}
              <Button
                variant="ghost"
                disabled={archiveMutation.isPending}
                onClick={() => {
                  if (window.confirm(`Archive published ${published.code}? Robots will lose the active map.`)) {
                    archiveMutation.mutate(published.id)
                  }
                }}
              >
                Archive
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
            {import.meta.env.DEV ? (
              <Button
                variant="outline"
                disabled={sampleMutation.isPending}
                onClick={() => sampleMutation.mutate()}
              >
                <Icon name="bolt" size={15} /> {sampleMutation.isPending ? 'Loading…' : 'Load Sample Map'}
              </Button>
            ) : null}
            <Button
              variant="outline"
              disabled={Boolean(draft)}
              title={draft ? 'Archive or publish the current draft first' : undefined}
              onClick={() => {
                setCreateOpen(true)
                setCreateForm(emptyCreateForm())
                setCreateError(null)
              }}
            >
              <Icon name="plus" size={15} /> Create
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Icon name="upload" size={15} /> Import
            </Button>
          </div>
        </header>

        {createOpen ? (
          <div className="mb-6 rounded-lg border border-outline-soft bg-surface p-5 shadow-float">
            <h3 className="text-md font-book">Create map (metadata only)</h3>
            <p className="mt-1 text-sm text-ink-2">
              Creates a DRAFT with name/resolution/origin only (not from a file). You must Import yaml + pgm
              next before Edit — the editor needs image width/height from the PGM.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="text-sm">
                Name
                <input
                  className="mt-1 block w-64 rounded border border-outline-soft bg-container px-3 py-2"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Floor 1 draft"
                />
              </label>
              <label className="text-sm">
                Resolution (m/px)
                <input
                  className="mt-1 block w-28 rounded border border-outline-soft bg-container px-3 py-2 tabular-nums"
                  value={createForm.resolution}
                  onChange={(e) => setCreateForm((f) => ({ ...f, resolution: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                Origin X
                <input
                  className="mt-1 block w-28 rounded border border-outline-soft bg-container px-3 py-2 tabular-nums"
                  value={createForm.originX}
                  onChange={(e) => setCreateForm((f) => ({ ...f, originX: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                Origin Y
                <input
                  className="mt-1 block w-28 rounded border border-outline-soft bg-container px-3 py-2 tabular-nums"
                  value={createForm.originY}
                  onChange={(e) => setCreateForm((f) => ({ ...f, originY: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                Origin Yaw
                <input
                  className="mt-1 block w-28 rounded border border-outline-soft bg-container px-3 py-2 tabular-nums"
                  value={createForm.originYaw}
                  onChange={(e) => setCreateForm((f) => ({ ...f, originYaw: e.target.value }))}
                />
              </label>
              <Button
                variant="primary"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate(createForm)}
              >
                {createMutation.isPending ? 'Creating…' : 'Create draft'}
              </Button>
              <Button variant="ghost" onClick={() => { setCreateOpen(false); setCreateError(null) }}>
                Cancel
              </Button>
            </div>
            {createError ? <p className="mt-3 text-sm text-red">{createError}</p> : null}
          </div>
        ) : null}

        {editTarget ? (
          <div className="mb-6 rounded-lg border border-outline-soft bg-surface p-5 shadow-float">
            <h3 className="text-md font-book">Update map metadata · {editTarget.code}</h3>
            <p className="mt-1 text-sm text-ink-2">
              DRAFT only. Asset URIs are kept as-is (local /map-assets or S3 HTTPS after import).
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="text-sm">
                Name
                <input
                  className="mt-1 block w-64 rounded border border-outline-soft bg-container px-3 py-2"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                Resolution (m/px)
                <input
                  className="mt-1 block w-28 rounded border border-outline-soft bg-container px-3 py-2 tabular-nums"
                  value={editForm.resolution}
                  onChange={(e) => setEditForm((f) => ({ ...f, resolution: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                Origin X
                <input
                  className="mt-1 block w-28 rounded border border-outline-soft bg-container px-3 py-2 tabular-nums"
                  value={editForm.originX}
                  onChange={(e) => setEditForm((f) => ({ ...f, originX: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                Origin Y
                <input
                  className="mt-1 block w-28 rounded border border-outline-soft bg-container px-3 py-2 tabular-nums"
                  value={editForm.originY}
                  onChange={(e) => setEditForm((f) => ({ ...f, originY: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                Origin Yaw
                <input
                  className="mt-1 block w-28 rounded border border-outline-soft bg-container px-3 py-2 tabular-nums"
                  value={editForm.originYaw}
                  onChange={(e) => setEditForm((f) => ({ ...f, originYaw: e.target.value }))}
                />
              </label>
              <Button
                variant="primary"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ version: editTarget, form: editForm })}
              >
                {updateMutation.isPending ? 'Saving…' : 'Save metadata'}
              </Button>
              <Button variant="ghost" onClick={() => { setEditTarget(null); setEditError(null) }}>
                Cancel
              </Button>
            </div>
            {editError ? <p className="mt-3 text-sm text-red">{editError}</p> : null}
          </div>
        ) : null}

        {importOpen || importError ? (
          <div className="mb-6 rounded-lg border border-outline-soft bg-surface p-5 shadow-float">
            <h3 className="text-md font-book">Import ROS map (yaml + pgm)</h3>
            <p className="mt-1 text-sm text-ink-2">
              Creates a DRAFT MapVersion. Files are stored by MapAssetStorage (Local or S3); URIs are saved on the
              map row.
            </p>
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
                onClick={() =>
                  importMutation.mutate({
                    yaml: pendingYaml!,
                    pgm: pendingPgm!,
                    name: importName || undefined,
                  })
                }
              >
                {importMutation.isPending ? 'Importing…' : 'Import'}
              </Button>
              <Button variant="ghost" onClick={() => { setImportOpen(false); setImportError(null) }}>
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
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {maps.length === 0 ? (
              <EmptyRow colSpan={7}>No map versions yet. Create a draft or import yaml + pgm.</EmptyRow>
            ) : (
              maps.map((version) => (
                <Tr key={version.id}>
                  <Td tone="strong">
                    {hasMapImage(version) ? (
                      <button
                        type="button"
                        className="text-left font-medium text-ink hover:underline"
                        onClick={() => navigate(`/configure/facility/maps/${version.id}/edit`)}
                      >
                        {version.code}
                      </button>
                    ) : (
                      <span className="font-medium text-ink" title="Import yaml + pgm before editing">
                        {version.code}
                      </span>
                    )}
                    {activeMap?.id === version.id ? (
                      <span className="ml-2 text-xs font-medium text-green">Active</span>
                    ) : null}
                    {!hasMapImage(version) ? (
                      <span className="ml-2 text-xs text-muted">no image</span>
                    ) : null}
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
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      {version.status === 'DRAFT' ? (
                        <>
                          <button
                            type="button"
                            className="text-sm text-ink hover:underline"
                            onClick={() => openEdit(version)}
                          >
                            Metadata
                          </button>
                          {hasMapImage(version) ? (
                            <button
                              type="button"
                              className="text-sm text-ink hover:underline"
                              onClick={() => navigate(`/configure/facility/maps/${version.id}/edit`)}
                            >
                              Edit
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="text-sm text-ink hover:underline"
                              onClick={() => {
                                setImportOpen(true)
                                setActionError('Import yaml + pgm to unlock the map editor for this draft.')
                              }}
                            >
                              Import assets
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-sm text-ink hover:underline"
                            disabled={publishMutation.isPending || !hasMapImage(version)}
                            title={!hasMapImage(version) ? 'Import yaml + pgm first' : undefined}
                            onClick={() => publishMutation.mutate(version.id)}
                          >
                            Publish
                          </button>
                        </>
                      ) : null}
                      {version.status !== 'ARCHIVED' ? (
                        <button
                          type="button"
                          className="text-sm text-ink-2 hover:underline"
                          disabled={archiveMutation.isPending}
                          onClick={() => {
                            if (window.confirm(`Archive ${version.code}?`)) archiveMutation.mutate(version.id)
                          }}
                        >
                          Archive
                        </button>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </div>
  )
}

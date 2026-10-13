import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MapVersion } from '@/shared/api/contracts'
import { cx } from '@/shared/lib/cx'
import { Button, IconButton } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { MAP_STATUS_TONE } from '@/shared/ui/statusTones'
import { Table, Td, Th, Tr } from '@/shared/ui/Table'
import { formatDateTime } from '@/shared/lib/format'
import { WarehouseMap } from '@/shared/map/WarehouseMap'
import { SCENE_EDGES, SCENE_ENDPOINTS, SCENE_ZONES } from '@/shared/map/scene'
import { MAP_VERSIONS, WAREHOUSE_NAME } from './mock'

// What a MapVersion holds (rules/05): Zones, Edges and Endpoints.
const SCENE_STATS = `${SCENE_ZONES.length} zones, ${SCENE_EDGES.length} edges, ${SCENE_ENDPOINTS.length} endpoints`

interface MapCardProps {
  version: MapVersion
  when: string
  children: ReactNode
}

function MapCard({ version, when, children }: MapCardProps) {
  const tint =
    version.status === 'DRAFT'
      ? 'border-amber/40 bg-amber-soft/50'
      : version.status === 'PUBLISHED'
        ? 'border-green/40 bg-green-soft/50'
        : 'border-outline-soft bg-container'

  return (
    <article className={cx('overflow-hidden rounded-lg border shadow-float', tint)}>
      <div className="relative h-64 bg-container/60">
        <div className="absolute inset-x-0 top-4 bottom-0">
          <WarehouseMap layers={{ legend: false, controls: false, coordinates: false, robots: false }} labels="none" />
        </div>
        <StatusBadge tone={MAP_STATUS_TONE[version.status]} withDot surface className="absolute top-4 left-4 shadow-float">
          {version.status}
        </StatusBadge>
      </div>
      <div className="flex items-end justify-between gap-4 border-t border-outline-soft bg-surface/70 p-6">
        <div>
          <h3 className="text-md font-book">
            {WAREHOUSE_NAME}, version {version.versionNo}
          </h3>
          <p className="mt-1 text-sm text-ink-2">{when}</p>
          <p className="mt-0.5 text-xs text-muted">{SCENE_STATS}</p>
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
  const draft = MAP_VERSIONS.find((version) => version.status === 'DRAFT')
  const published = MAP_VERSIONS.find((version) => version.status === 'PUBLISHED')

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1500px] px-10 pt-8 pb-16">
        <h1 className="text-4xl font-book">Facility</h1>
        <p className="mt-3 text-base text-ink-2">The map robots navigate by: draft a new version, then publish it.</p>

        <div className="mt-10 grid grid-cols-2 gap-4">
          {draft ? (
            <MapCard version={draft} when={`Last modified ${formatDateTime(draft.modifiedAt ?? draft.createdAt)}`}>
              <Button variant="surface">Publish map</Button>
              <Button variant="primary" onClick={() => navigate(`/configure/facility/maps/${draft.id}/edit`)}>
                Edit
              </Button>
            </MapCard>
          ) : (
            <MissingMapCard title="No draft map">Create a draft from the published map to start editing.</MissingMapCard>
          )}

          {published ? (
            <MapCard version={published} when={`Published ${formatDateTime(published.publishedAt)}`}>
              <Button variant="surface">
                <Icon name="route" size={15} /> Distribute to robots
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
            <Button variant="outline">
              <Icon name="upload" size={15} /> Import
            </Button>
          </div>
        </header>

        <Table>
          <thead>
            <tr>
              <Th>Version</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th>Last modified</Th>
              <Th>Author</Th>
              <Th>Notes</Th>
            </tr>
          </thead>
          <tbody>
            {MAP_VERSIONS.map((version) => (
              <Tr key={version.id}>
                <Td tone="strong">Version {version.versionNo}</Td>
                <Td>
                  <StatusBadge tone={MAP_STATUS_TONE[version.status]}>{version.status}</StatusBadge>
                </Td>
                <Td className="tabular-nums">{formatDateTime(version.createdAt)}</Td>
                <Td className="tabular-nums">{formatDateTime(version.modifiedAt ?? version.publishedAt ?? version.createdAt)}</Td>
                <Td>{version.author ?? '—'}</Td>
                <Td className="max-w-80 truncate">{version.notes ?? '—'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  )
}

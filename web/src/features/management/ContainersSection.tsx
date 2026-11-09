import { useMemo, useState } from 'react'
import { useAuth } from '@/features/auth/authContext'
import type { ContainerStatus, StorageLocationView } from '@/shared/api/contracts'
import { hasPermission, PERMISSIONS } from '@/shared/auth/permissions'
import { formatIsoDateTime, humanize } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { SearchInput } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { CONTAINER_STATUS_TONE } from '@/shared/ui/statusTones'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import type { ContainerListing, ManagedContainer } from './api'
import { ContainerPhysicalDialog } from './ContainerPhysicalDialog'
import { RecoverContainerDialog } from './RecoverContainerDialog'
import { SectionHead } from './SectionHead'

const STATUSES: ContainerStatus[] = [
  'CREATED',
  'PACKED',
  'RESERVED',
  'IN_TRANSIT',
  'STORED',
  'HOLD',
  'EMPTY',
  'OUT_OF_SERVICE',
  'ISSUED',
]

/**
 * warehouse.containers: Containers are created by the receiving flow and their status changes only through the
 * Container lifecycle (CREATED -> PACKED -> RESERVED -> IN_TRANSIT -> STORED, rules/02). The one action here is naming the
 * shelf of a Container that lost its place after a failed or cancelled Job (WH-01).
 */
export function ContainersSection({
  listing,
  loadState,
  locations,
  onChanged,
}: {
  listing: ContainerListing
  loadState: 'loading' | 'ready' | 'error'
  locations: StorageLocationView[]
  onChanged: () => void
}) {
  const { capabilities } = useAuth()
  const mayRecover = hasPermission(capabilities, PERMISSIONS.containerRecover)
  const [recovering, setRecovering] = useState<ManagedContainer | null>(null)
  const [measuring, setMeasuring] = useState<ManagedContainer | null>(null)
  const containers = listing.items
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<ContainerStatus | ''>('')

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return containers.filter(
      (item) =>
        (status === '' || item.status === status) &&
        (needle === '' ||
          item.barcode.toLowerCase().includes(needle) ||
          item.sku.toLowerCase().includes(needle) ||
          item.productName.toLowerCase().includes(needle)),
    )
  }, [containers, query, status])

  return (
    <>
      <SectionHead title="Containers" hint={
          listing.warehouseName
            ? `The physical units the robots carry in ${listing.warehouseName}. One Container holds one product type.`
            : 'The physical units the robots carry. One Container holds one product type.'
        }>
        <SearchInput className="w-72" placeholder="Search barcode, SKU or product" value={query} onChange={setQuery} />
        <select
          className={controlClass('pill')}
          aria-label="Filter by status"
          value={status}
          onChange={(event) => setStatus(event.target.value as ContainerStatus | '')}
        >
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </select>
      </SectionHead>

      <Table>
        <thead>
          <tr>
            <Th>Barcode</Th>
            <Th>Product</Th>
            <Th>Status</Th>
            <Th>Location</Th>
            <Th>Level</Th>
            <Th>Supplier package</Th>
            <Th align="right">Updated</Th>
            <Th align="right">{mayRecover ? 'Action' : ''}</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((item) => (
            <Tr key={item.id}>
              <Td className="font-mono text-xs">{item.barcode}</Td>
              <Td>
                <span className="font-medium text-ink">{item.productName}</span>{' '}
                <span className="font-mono text-xs text-muted">{item.sku}</span>
              </Td>
              <Td>
                <StatusBadge tone={CONTAINER_STATUS_TONE[item.status]}>{item.status}</StatusBadge>
              </Td>
              <Td tone="faint">{item.locationCode ?? '—'}</Td>
              <Td tone="faint">{item.currentLevelNo ?? '—'}</Td>
              <Td tone="faint" className="font-mono text-xs">
                {item.supplierPackageBarcode ?? '—'}
              </Td>
              <Td align="right" tone="faint">
                {formatIsoDateTime(item.updatedAt)}
              </Td>
              <Td align="right">
                {mayRecover && !item.inActiveTransport && (item.status === 'IN_TRANSIT' || item.status === 'HOLD') ? (
                  <Button size="sm" variant="ghost" onClick={() => setRecovering(item)}>
                    Recover
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => setMeasuring(item)}>
                  Size
                </Button>
              </Td>
            </Tr>
          ))}
          {visible.length === 0 ? (
            <EmptyRow colSpan={8}>
              {loadState === 'loading'
                ? 'Loading containers…'
                : loadState === 'error'
                  ? 'Could not load containers. Check that the API is running, then reload.'
                  : listing.warehouseName === null
                    ? 'No active warehouse yet, so there are no containers to show.'
                    : containers.length === 0
                      ? 'No containers in this warehouse yet.'
                      : 'No containers match this filter.'}
            </EmptyRow>
          ) : null}
        </tbody>
      </Table>
      {measuring ? <ContainerPhysicalDialog container={measuring} onClose={() => setMeasuring(null)} /> : null}
      {recovering ? (
        <RecoverContainerDialog
          container={recovering}
          locations={locations}
          onClose={() => setRecovering(null)}
          onRecovered={onChanged}
        />
      ) : null}
      {listing.total > containers.length ? (
        <p className="mt-3 text-xs text-muted">
          Showing the first {containers.length} of {listing.total} containers. Search to find the others.
        </p>
      ) : null}
    </>
  )
}

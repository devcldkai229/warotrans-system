import { useMemo, useState } from 'react'
import type { ContainerStatus } from '@/shared/api/contracts'
import { formatIsoDateTime, humanize } from '@/shared/lib/format'
import { SearchInput } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { CONTAINER_STATUS_TONE } from '@/shared/ui/statusTones'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import type { ContainerListing } from './api'
import { SectionHead } from './SectionHead'

const STATUSES: ContainerStatus[] = ['CREATED', 'PACKED', 'RESERVED', 'IN_TRANSIT', 'STORED', 'HOLD', 'EMPTY', 'OUT_OF_SERVICE']

/**
 * warehouse.containers, read-only: Containers are created by the receiving flow and their status changes only through
 * the Container lifecycle (CREATED -> PACKED -> RESERVED -> IN_TRANSIT -> STORED, rules/02).
 */
export function ContainersSection({ listing, loadState }: { listing: ContainerListing; loadState: 'loading' | 'ready' | 'error' }) {
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
            </Tr>
          ))}
          {visible.length === 0 ? (
            <EmptyRow colSpan={7}>
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
      {listing.total > containers.length ? (
        <p className="mt-3 text-xs text-muted">
          Showing the first {containers.length} of {listing.total} containers. Search to find the others.
        </p>
      ) : null}
    </>
  )
}

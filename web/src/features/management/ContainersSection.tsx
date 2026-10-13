import { useMemo, useState } from 'react'
import type { ContainerStatus, ContainerView } from '@/shared/api/contracts'
import { formatIsoDateTime } from '@/shared/lib/format'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { CONTAINER_STATUS_TONE } from '@/shared/ui/statusTones'
import { SectionHead } from './SectionHead'

const STATUSES: ContainerStatus[] = ['CREATED', 'PACKED', 'RESERVED', 'IN_TRANSIT', 'STORED', 'HOLD', 'EMPTY', 'OUT_OF_SERVICE']

/**
 * warehouse.containers, read-only: Containers are created by the receiving flow and their status changes only through
 * the Container lifecycle (CREATED -> PACKED -> RESERVED -> IN_TRANSIT -> STORED, rules/02).
 */
export function ContainersSection({ containers }: { containers: ContainerView[] }) {
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
      <SectionHead title="Containers" hint="The physical units the robots carry. One Container holds one product type.">
        <input placeholder="Search barcode, SKU or product…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select value={status} onChange={(event) => setStatus(event.target.value as ContainerStatus | '')}>
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </SectionHead>

      <table className="mtable">
        <thead>
          <tr>
            <th>Barcode</th>
            <th>Product</th>
            <th>Status</th>
            <th>Location</th>
            <th>Level</th>
            <th>Supplier package</th>
            <th className="is-right">Updated</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((item) => (
            <tr key={item.id}>
              <td>{item.barcode}</td>
              <td>
                <span className="is-strong">{item.productName}</span> <span className="is-faint">{item.sku}</span>
              </td>
              <td>
                <StatusBadge tone={CONTAINER_STATUS_TONE[item.status]}>{item.status}</StatusBadge>
              </td>
              <td className="is-faint">{item.locationCode ?? '—'}</td>
              <td className="is-faint">{item.currentLevelNo ?? '—'}</td>
              <td className="is-faint">{item.supplierPackageBarcode ?? '—'}</td>
              <td className="is-right is-faint">{formatIsoDateTime(item.updatedAt)}</td>
            </tr>
          ))}
          {visible.length === 0 ? (
            <tr>
              <td colSpan={7} className="mtable__empty">
                No containers match the filter
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </>
  )
}

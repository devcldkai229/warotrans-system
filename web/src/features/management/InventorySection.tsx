import { useMemo, useState } from 'react'
import type { InventoryStockView } from '@/shared/api/contracts'
import { formatIsoDateTime } from '@/shared/lib/format'
import { SectionHead } from './SectionHead'

/**
 * warehouse.inventory_stocks, read-only: stock changes only through the Container lifecycle (putaway, retrieval,
 * relocation), so there is no manual adjustment. Counts are Containers, not product units (rules/00).
 */
export function InventorySection({ inventory }: { inventory: InventoryStockView[] }) {
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return inventory.filter(
      (row) =>
        needle === '' ||
        row.sku.toLowerCase().includes(needle) ||
        row.productName.toLowerCase().includes(needle) ||
        row.locationCode.toLowerCase().includes(needle),
    )
  }, [inventory, query])

  return (
    <>
      <SectionHead title="Inventory" hint="Containers stored per product, location and shelf level. Counts are Containers, not units.">
        <input placeholder="Search SKU, product or location…" value={query} onChange={(event) => setQuery(event.target.value)} />
      </SectionHead>

      <table className="mtable">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product</th>
            <th>Location</th>
            <th>Level</th>
            <th className="is-right">Containers</th>
            <th className="is-right">Updated</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.id}>
              <td>{row.sku}</td>
              <td className="is-strong">{row.productName}</td>
              <td className="is-faint">{row.locationCode}</td>
              <td className="is-faint">{row.levelNo}</td>
              <td className="is-right is-strong">{row.containerCount}</td>
              <td className="is-right is-faint">{formatIsoDateTime(row.updatedAt)}</td>
            </tr>
          ))}
          {visible.length === 0 ? (
            <tr>
              <td colSpan={6} className="mtable__empty">
                No stock records match the filter
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </>
  )
}

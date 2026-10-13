import { useMemo, useState } from 'react'
import type { InventoryStockView } from '@/shared/api/contracts'
import { formatIsoDateTime } from '@/shared/lib/format'
import { SearchInput } from '@/shared/ui/Field'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
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
        <SearchInput className="w-72" placeholder="Search SKU, product or location" value={query} onChange={setQuery} />
      </SectionHead>

      <Table>
        <thead>
          <tr>
            <Th>SKU</Th>
            <Th>Product</Th>
            <Th>Location</Th>
            <Th>Level</Th>
            <Th align="right">Containers</Th>
            <Th align="right">Updated</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <Tr key={row.id}>
              <Td className="font-mono text-xs">{row.sku}</Td>
              <Td tone="strong">{row.productName}</Td>
              <Td tone="faint">{row.locationCode}</Td>
              <Td tone="faint">{row.levelNo}</Td>
              <Td align="right" tone="strong">
                {row.containerCount}
              </Td>
              <Td align="right" tone="faint">
                {formatIsoDateTime(row.updatedAt)}
              </Td>
            </Tr>
          ))}
          {visible.length === 0 ? <EmptyRow colSpan={6}>No stock records match this filter.</EmptyRow> : null}
        </tbody>
      </Table>
    </>
  )
}

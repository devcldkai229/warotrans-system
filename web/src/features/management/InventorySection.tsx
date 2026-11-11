import { useMemo, useState } from 'react'
import { formatIsoDateTime } from '@/shared/lib/format'
import { SearchInput } from '@/shared/ui/Field'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import type { InventoryListing } from './api'
import { SectionHead } from './SectionHead'
import { t } from '@/shared/i18n'
/**

 * warehouse.inventory_stocks, read-only: stock changes only through the Container lifecycle (putaway, retrieval,
 * relocation), so there is no manual adjustment. Counts are Containers, not product units (rules/00).
 */
export function InventorySection({ listing, loadState }: { listing: InventoryListing; loadState: 'loading' | 'ready' | 'error' }) {
  const inventory = listing.items
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
      <SectionHead title={t('Inventory')} hint={t('Containers stored per product, location and shelf level. Counts are Containers, not units.')}>
        <SearchInput className="w-72" placeholder={t('Search SKU, product or location')} value={query} onChange={setQuery} />
      </SectionHead>

      <Table>
        <thead>
          <tr>
            <Th>{t('SKU')}</Th>
            <Th>{t('Product')}</Th>
            <Th>{t('Location')}</Th>
            <Th>{t('Level')}</Th>
            <Th align="right">{t('Containers')}</Th>
            <Th align="right">{t('Updated')}</Th>
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
          {visible.length === 0 ? (
            <EmptyRow colSpan={6}>
              {loadState === 'loading'
                ? t('Loading inventory…')
                : loadState === 'error'
                  ? t('Could not load inventory. Check that the API is running, then reload.')
                  : listing.warehouseName === null
                    ? t('No active warehouse yet, so there is no stock to show.')
                    : inventory.length === 0
                      ? t('No stock yet. Stock appears here once containers are put away on shelves.')
                      : t('No stock records match this filter.')}
            </EmptyRow>
          ) : null}
        </tbody>
      </Table>
      {listing.total > inventory.length ? (
        <p className="mt-3 text-xs text-muted">{t('Showing the first {length} of {total} stock rows. Search to find the others.', { length: inventory.length, total: listing.total })}</p>
      ) : null}
    </>
  )
}

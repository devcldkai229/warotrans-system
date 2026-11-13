import { useRef } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { cx } from '@/shared/lib/cx'
import { formatIsoDateTime } from '@/shared/lib/format'
import { pageCountOf } from '@/shared/lib/pagination'
import { useClampedPage, usePagedSearchParams, useSearchParam } from '@/shared/lib/usePagedSearchParams'
import { SearchInput } from '@/shared/ui/Field'
import { Pagination } from '@/shared/ui/Pagination'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { listManagedInventory } from './api'
import { SectionHead } from './SectionHead'
import { t } from '@/shared/i18n'

const PAGE_SIZE = 50

/**
 * warehouse.inventory_stocks, read-only: stock changes only through the Container lifecycle (putaway, retrieval,
 * relocation), so there is no manual adjustment. Counts are Containers, not product units (rules/00). The server
 * searches and pages, so every row can be reached.
 */
export function InventorySection() {
  const { params, page, setParam, setPage } = usePagedSearchParams()
  const { text, setText, search } = useSearchParam(params, setParam)

  const listing = useQuery({
    queryKey: ['management-inventory', search, page],
    queryFn: () => listManagedInventory({ search: search || undefined, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
  const rows = listing.data?.items ?? []
  const total = listing.data?.total ?? 0
  const pageCount = pageCountOf(total, PAGE_SIZE)
  const firstShown = (page - 1) * PAGE_SIZE + 1
  useClampedPage(page, pageCount, listing.data !== undefined && !listing.isPlaceholderData, setPage)

  const top = useRef<HTMLDivElement>(null)
  const goToPage = (target: number) => {
    setPage(target)
    top.current?.scrollIntoView({ block: 'start' })
  }

  const warehouseName = listing.data?.warehouseName
  const hint = [warehouseName, t('Counts are Containers, not units.')].filter(Boolean).join(' · ')

  return (
    <div ref={top} className="scroll-mt-4">
      <SectionHead title={t('Inventory')} hint={hint}>
        <SearchInput className="w-72" placeholder={t('Search SKU, product or location')} value={text} onChange={setText} />
      </SectionHead>

      <div className={cx('transition-opacity duration-200', listing.isPlaceholderData && 'opacity-60')}>
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
            {rows.map((row) => (
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
            {rows.length === 0 ? (
              <EmptyRow colSpan={6}>
                {listing.isPending
                  ? t('Loading inventory…')
                  : listing.isError
                    ? t('Could not load inventory. Check that the API is running, then reload.')
                    : warehouseName === null
                      ? t('No active warehouse yet, so there is no stock to show.')
                      : search
                        ? t('No stock records match this filter.')
                        : t('No stock yet. Stock appears here once containers are put away on shelves.')}
              </EmptyRow>
            ) : null}
          </tbody>
        </Table>
      </div>

      {rows.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-muted">
            {t('Showing {from}–{to} of {total}', { from: firstShown, to: firstShown + rows.length - 1, total })}
          </p>
          <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} onChange={goToPage} />
        </div>
      ) : null}
    </div>
  )
}

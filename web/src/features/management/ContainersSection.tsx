import { useRef, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/authContext'
import type { ContainerStatus, StorageLocationView } from '@/shared/api/contracts'
import { hasPermission, PERMISSIONS } from '@/shared/auth/permissions'
import { cx } from '@/shared/lib/cx'
import { formatIsoDateTime, humanize } from '@/shared/lib/format'
import { pageCountOf } from '@/shared/lib/pagination'
import { useClampedPage, usePagedSearchParams, useSearchParam } from '@/shared/lib/usePagedSearchParams'
import { Button } from '@/shared/ui/Button'
import { SearchInput } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { Pagination } from '@/shared/ui/Pagination'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { CONTAINER_STATUS_TONE } from '@/shared/ui/statusTones'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { listManagedContainers, type ManagedContainer } from './api'
import { ContainerPhysicalDialog } from './ContainerPhysicalDialog'
import { RecoverContainerDialog } from './RecoverContainerDialog'
import { SectionHead } from './SectionHead'
import { t } from '@/shared/i18n'

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
const PAGE_SIZE = 50

/**
 * warehouse.containers: Containers are created by the receiving flow and their status changes only through the
 * Container lifecycle (CREATED -> PACKED -> RESERVED -> IN_TRANSIT -> STORED, rules/02). The one action here is naming the
 * shelf of a Container that lost its place after a failed or cancelled Job (WH-01). The server searches, filters by
 * status and pages, so every Container can be reached.
 */
export function ContainersSection({ locations, onChanged }: { locations: StorageLocationView[]; onChanged: () => void }) {
  const { capabilities } = useAuth()
  const mayRecover = hasPermission(capabilities, PERMISSIONS.containerRecover)
  const [recovering, setRecovering] = useState<ManagedContainer | null>(null)
  const [measuring, setMeasuring] = useState<ManagedContainer | null>(null)
  const queryClient = useQueryClient()

  const { params, page, setParam, setPage } = usePagedSearchParams()
  const { text, setText, search } = useSearchParam(params, setParam)
  const status = (STATUSES as string[]).includes(params.get('status') ?? '') ? (params.get('status') as ContainerStatus) : ''

  const listing = useQuery({
    queryKey: ['management-containers', search, status, page],
    queryFn: () =>
      listManagedContainers({ search: search || undefined, status: status || undefined, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
  const containers = listing.data?.items ?? []
  const total = listing.data?.total ?? 0
  const pageCount = pageCountOf(total, PAGE_SIZE)
  const firstShown = (page - 1) * PAGE_SIZE + 1
  useClampedPage(page, pageCount, listing.data !== undefined && !listing.isPlaceholderData, setPage)

  const top = useRef<HTMLDivElement>(null)
  const goToPage = (target: number) => {
    setPage(target)
    top.current?.scrollIntoView({ block: 'start' })
  }
  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: ['management-containers'] })
    onChanged()
  }

  const warehouseName = listing.data?.warehouseName
  const filtered = Boolean(search || status)

  return (
    <div ref={top} className="scroll-mt-4">
      <SectionHead title={t('Containers')} hint={warehouseName ?? undefined}>
        <SearchInput className="w-72" placeholder={t('Search barcode, SKU or product')} value={text} onChange={setText} />
        <select
          className={controlClass('pill')}
          aria-label={t('Filter by status')}
          value={status}
          onChange={(event) => setParam('status', event.target.value)}
        >
          <option value="">{t('All statuses')}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </select>
      </SectionHead>

      <div className={cx('transition-opacity duration-200', listing.isPlaceholderData && 'opacity-60')}>
        <Table>
          <thead>
            <tr>
              <Th>{t('Barcode')}</Th>
              <Th>{t('Product')}</Th>
              <Th>{t('Status')}</Th>
              <Th>{t('Location')}</Th>
              <Th>{t('Level')}</Th>
              <Th>{t('Supplier package')}</Th>
              <Th align="right">{t('Updated')}</Th>
              <Th align="right">{mayRecover ? t('Action') : ''}</Th>
            </tr>
          </thead>
          <tbody>
            {containers.map((item) => (
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
            {containers.length === 0 ? (
              <EmptyRow colSpan={8}>
                {listing.isPending
                  ? t('Loading containers…')
                  : listing.isError
                    ? t('Could not load containers. Check that the API is running, then reload.')
                    : warehouseName === null
                      ? t('No active warehouse yet, so there are no containers to show.')
                      : filtered
                        ? t('No containers match this filter.')
                        : t('No containers in this warehouse yet.')}
              </EmptyRow>
            ) : null}
          </tbody>
        </Table>
      </div>

      {containers.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-muted">
            {t('Showing {from}–{to} of {total}', { from: firstShown, to: firstShown + containers.length - 1, total })}
          </p>
          <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} onChange={goToPage} />
        </div>
      ) : null}

      {measuring ? <ContainerPhysicalDialog container={measuring} onClose={() => setMeasuring(null)} /> : null}
      {recovering ? (
        <RecoverContainerDialog
          container={recovering}
          locations={locations}
          onClose={() => setRecovering(null)}
          onRecovered={changed}
        />
      ) : null}
    </div>
  )
}

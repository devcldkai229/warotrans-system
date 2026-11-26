import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/authContext'
import { holdsPermission, PERMISSIONS } from '@/shared/auth/permissions'
import type { ContainerStatus } from '@/shared/api/contracts'
import { formatIsoDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { CONTAINER_STATUS_TONE } from '@/shared/ui/statusTones'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { listManagedContainers } from './api'
import { t } from '@/shared/i18n'

/** True when this session may edit the warehouse master data (the server checks again on every save). */
export function useMayEditWarehouse(): boolean {
  const { can } = useAuth()
  return holdsPermission(can, PERMISSIONS.warehouseWrite)
}

/** Label / value pairs in two columns. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-muted">{item.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function DetailHeading({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mt-6 mb-2 flex items-baseline justify-between gap-4">
      <h3 className="text-sm font-medium text-ink">{children}</h3>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  )
}

/** The buttons at the bottom of a detail card. */
export function DetailFooter({ children }: { children: ReactNode }) {
  return <footer className="flex flex-wrap justify-end gap-2 px-6 pb-6">{children}</footer>
}

export function EditFooter({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return (
    <DetailFooter>
      <Button variant="ghost" onClick={onCancel}>
        {t('Cancel')}
      </Button>
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? t('Saving…') : t('Save changes')}
      </Button>
    </DetailFooter>
  )
}

const LIST_SIZE = 50

/**
 * The Containers of a product and/or at a location (and level), straight from the containers list so it shows what
 * the Containers page would. At most 50 rows; the count says when there are more.
 */
export function ContainerList({
  productId,
  storageLocationId,
  levelNo,
  showProduct = true,
}: {
  productId?: string
  storageLocationId?: string
  levelNo?: number
  showProduct?: boolean
}) {
  const listing = useQuery({
    queryKey: ['management-detail-containers', productId ?? null, storageLocationId ?? null, levelNo ?? null],
    queryFn: () => listManagedContainers({ productId, storageLocationId, levelNo, take: LIST_SIZE }),
  })
  const rows = listing.data?.items ?? []
  const total = listing.data?.total ?? 0

  return (
    <>
      <DetailHeading hint={total > rows.length ? t('Showing {shown} of {total}', { shown: rows.length, total }) : null}>
        {t('Containers')} {listing.data ? <span className="text-muted">({total})</span> : null}
      </DetailHeading>
      <div className="max-h-72 overflow-auto rounded-md border border-outline-soft">
        <Table>
          <thead>
            <tr>
              <Th>{t('Barcode')}</Th>
              {showProduct ? <Th>{t('Product')}</Th> : null}
              <Th align="right">{t('Quantity')}</Th>
              <Th>{t('Status')}</Th>
              <Th>{t('Location')}</Th>
              <Th>{t('Level')}</Th>
              <Th align="right">{t('Updated')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <Tr key={item.id}>
                <Td className="font-mono text-xs">{item.barcode}</Td>
                {showProduct ? (
                  <Td>
                    {item.productName} <span className="font-mono text-xs text-muted">{item.sku}</span>
                  </Td>
                ) : null}
                <Td align="right" className="tabular-nums">
                  {item.contentsQuantity ?? '—'}
                </Td>
                <Td>
                  <StatusBadge tone={CONTAINER_STATUS_TONE[item.status as ContainerStatus] ?? 'grey'}>{item.status}</StatusBadge>
                  {item.inActiveTransport ? <span className="ml-2 text-xs text-muted">{t('Moving')}</span> : null}
                </Td>
                <Td tone="faint">{item.locationCode ?? '—'}</Td>
                <Td tone="faint">{item.currentLevelNo ?? '—'}</Td>
                <Td align="right" tone="faint">
                  {formatIsoDateTime(item.updatedAt)}
                </Td>
              </Tr>
            ))}
            {rows.length === 0 ? (
              <EmptyRow colSpan={showProduct ? 7 : 6}>
                {listing.isPending
                  ? t('Loading containers…')
                  : listing.isError
                    ? t('Could not load containers. Check that the API is running, then reload.')
                    : t('No containers here.')}
              </EmptyRow>
            ) : null}
          </tbody>
        </Table>
      </div>
    </>
  )
}

/** The message of a failed request, for a FormError. */
export function failureText(failure: unknown, fallback: string): string {
  return failure instanceof Error ? failure.message : fallback
}

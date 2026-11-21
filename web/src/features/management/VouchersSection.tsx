import { printLabelSheet, qrPayload } from '@/features/labels/printLabels'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Can } from '@/features/auth/RequirePermission'
import { PERMISSIONS } from '@/shared/auth/permissions'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Product } from '@/shared/api/contracts'
import {
  addStockVoucherLines,
  cancelStockVoucher,
  closeStockVoucherShort,
  confirmStockVoucher,
  createStockVoucher,
  getStockVoucher,
  listContainers,
  listWarehouses,
  removeStockVoucherLine,
  type ContainerListItem,
  type StockVoucherDetail,
  type StockVoucherStatus,
  type StockVoucherType,
} from '@/shared/api/warehouses'
import { cx } from '@/shared/lib/cx'
import { formatIsoDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { Dialog, Modal } from '@/shared/ui/Dialog'
import { Field, FieldRow, FormError, SearchInput } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { Icon } from '@/shared/ui/Icon'
import { Meter } from '@/shared/ui/Meter'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { CONTAINER_STATUS_TONE } from '@/shared/ui/statusTones'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { AddButton, SectionHead } from './SectionHead'
import {
  VOUCHER_STATUS_LABEL,
  VOUCHER_STATUS_TONE,
  VOUCHER_TYPE_LABEL,
  VOUCHER_TYPE_TONE,
  VOUCHERS_KEY,
  dispatchableLine,
  doneLabel,
  printVoucher,
  useStockVouchers,
} from './stockVouchers'
import { t } from '@/shared/i18n'
function errorText(failure: unknown, fallback: string): string {

  return failure instanceof Error && failure.message ? failure.message : fallback
}

interface VouchersSectionProps {
  /** The working Warehouse, shown first; null when no active one exists yet. */
  warehouse: { id: string; name: string } | null
  /** Kept for callers; Containers are picked one by one, not by product. */
  products?: Product[]
}

type WarehouseOption = { id: string; code: string; name: string }

/**
 * warehouse.stock_vouchers: phiếu nhập (INBOUND) and phiếu xuất (OUTBOUND). The quantity is a Container count, one line
 * per Container. People take it DRAFT → CONFIRMED (or create it confirmed at once); it becomes COMPLETED by itself when
 * its last Container is on a shelf (inbound) or issued at an Outbound gate (outbound), or when people close it short.
 * Stock follows each Container as robots deliver it, never the voucher status.
 */
export function VouchersSection({ warehouse }: VouchersSectionProps) {
  const queryClient = useQueryClient()
  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ isActive: true, take: 50 }),
  })
  const warehouses: WarehouseOption[] = useMemo(() => warehousesQuery.data?.items ?? [], [warehousesQuery.data])
  // Vouchers belong to one warehouse; the tab starts on the working one and staff can switch.
  const [pickedWarehouseId, setPickedWarehouseId] = useState('')
  const warehouseId = pickedWarehouseId || warehouse?.id || ''
  const current = warehouses.find((item) => item.id === warehouseId) ?? (warehouse?.id === warehouseId ? warehouse : null)
  const vouchersQuery = useStockVouchers(warehouseId || null)
  const [type, setType] = useState<StockVoucherType | ''>('')
  const [status, setStatus] = useState<StockVoucherStatus | ''>('')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const vouchers = useMemo(() => vouchersQuery.data?.items ?? [], [vouchersQuery.data])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return vouchers.filter(
      (voucher) =>
        (type === '' || voucher.type === type) &&
        (status === '' || voucher.status === status) &&
        (needle === '' || voucher.code.toLowerCase().includes(needle) || (voucher.referenceNo ?? '').toLowerCase().includes(needle)),
    )
  }, [vouchers, type, status, query])

  function refreshList() {
    void queryClient.invalidateQueries({ queryKey: VOUCHERS_KEY })
  }

  return (
    <>
      <SectionHead
        title={t('Stock vouchers')}
        hint={[current?.name, t('Quantities are Containers, not units.')].filter(Boolean).join(' · ')}
        info={{
          label: t('How stock vouchers work'),
          text: t('Create a voucher as a draft, or create and confirm it at once. Robots then move its Containers: stock is added as each one reaches a shelf (inbound) or taken off as each one is delivered to an Outbound gate (outbound), and the voucher completes with the last one. Only a draft can be changed or cancelled; a confirmed voucher can be closed short.'),
        }}
      >
        <select
          className={controlClass('pill', 'shrink-0')}
          aria-label={t('Warehouse')}
          value={warehouseId}
          onChange={(event) => setPickedWarehouseId(event.target.value)}
        >
          {warehouses.length === 0 && warehouse ? <option value={warehouse.id}>{warehouse.name}</option> : null}
          {warehouses.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · {item.name}
            </option>
          ))}
        </select>
        <select className={controlClass('pill', 'shrink-0')} value={type} onChange={(event) => setType(event.target.value as StockVoucherType | '')}>
          <option value="">{t('All types')}</option>
          <option value="INBOUND">{t('Inbound')}</option>
          <option value="OUTBOUND">{t('Outbound')}</option>
        </select>
        <select className={controlClass('pill', 'shrink-0')} value={status} onChange={(event) => setStatus(event.target.value as StockVoucherStatus | '')}>
          <option value="">{t('All statuses')}</option>
          <option value="DRAFT">{t('Draft')}</option>
          <option value="CONFIRMED">{t('Confirmed')}</option>
          <option value="COMPLETED">{t('Completed')}</option>
          <option value="CANCELLED">{t('Cancelled')}</option>
        </select>
        <SearchInput className="w-48" placeholder={t('Search code or reference')} value={query} onChange={setQuery} />
        {warehouseId ? (
          <Can permission={PERMISSIONS.voucherWrite}>
            <AddButton onClick={() => setCreating(true)}>{t('New voucher')}</AddButton>
          </Can>
        ) : null}
      </SectionHead>

      <Table>
        <thead>
          <tr>
            <Th>{t('Code')}</Th>
            <Th>{t('Type')}</Th>
            <Th>{t('Reference')}</Th>
            <Th>{t('Status')}</Th>
            <Th align="right">{t('Containers')}</Th>
            <Th>{t('Progress')}</Th>
            <Th align="right">{t('Created')}</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((voucher) => (
            <Tr key={voucher.id}>
              <Td>
                <button type="button" className="font-mono text-xs font-medium text-ink hover:underline" onClick={() => setOpenId(voucher.id)}>
                  {voucher.code}
                </button>
              </Td>
              <Td>
                <StatusBadge tone={VOUCHER_TYPE_TONE[voucher.type]}>{VOUCHER_TYPE_LABEL[voucher.type]}</StatusBadge>
              </Td>
              <Td tone="faint">{voucher.referenceNo ?? '—'}</Td>
              <Td>
                <StatusBadge tone={VOUCHER_STATUS_TONE[voucher.status]} withDot>
                  {VOUCHER_STATUS_LABEL[voucher.status]}
                </StatusBadge>
              </Td>
              <Td align="right" tone="strong">
                {voucher.containerCount}
              </Td>
              <Td>
                <Progress done={voucher.doneCount} total={voucher.containerCount} type={voucher.type} />
              </Td>
              <Td align="right" tone="faint">
                {formatIsoDateTime(voucher.createdAt)}
              </Td>
            </Tr>
          ))}
          {visible.length === 0 ? (
            <EmptyRow colSpan={7}>
              {vouchersQuery.isLoading
                ? t('Loading vouchers…')
                : vouchersQuery.isError
                  ? t('Could not load vouchers. Check that the API is running, then reload.')
                  : !warehouseId
                    ? t('No active warehouse yet, so there are no vouchers.')
                    : vouchers.length === 0
                      ? t('No vouchers yet. Create the first phiếu nhập.')
                      : t('No voucher matches these filters.')}
            </EmptyRow>
          ) : null}
        </tbody>
      </Table>

      {creating && warehouseId ? (
        <CreateVoucherDialog
          warehouses={warehouses.length > 0 ? warehouses : current ? [{ code: '', ...current }] : []}
          defaultWarehouseId={warehouseId}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false)
            setPickedWarehouseId(created.warehouseId)
            refreshList()
            setOpenId(created.id)
          }}
        />
      ) : null}

      {openId ? (
        <VoucherDetailModal
          id={openId}
          onChanged={refreshList}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  )
}

function Progress({ done, total, type }: { done: number; total: number; type: StockVoucherType }) {
  if (total === 0) return <span className="text-xs text-muted">—</span>
  return (
    <span className="flex items-center gap-2">
      <Meter className="w-20" percent={(done / total) * 100} tone={done === total ? 'green' : 'blue'} />
      <span className="text-xs text-ink-2 tabular-nums">
        {done}/{total} {doneLabel(type)}
      </span>
    </span>
  )
}

/* ---------------------------------------------------------------------------------------------- create */

function CreateVoucherDialog({
  warehouses,
  defaultWarehouseId,
  onClose,
  onCreated,
}: {
  warehouses: WarehouseOption[]
  defaultWarehouseId: string
  onClose: () => void
  onCreated: (voucher: StockVoucherDetail) => void
}) {
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId)
  const [type, setType] = useState<StockVoucherType>('INBOUND')
  const [referenceNo, setReferenceNo] = useState('')
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'draft' | 'confirm' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save(confirm: boolean) {
    if (confirm && selected.size === 0) {
      setError(t('Select the Containers to confirm the voucher with.'))
      return
    }

    setBusy(confirm ? 'confirm' : 'draft')
    setError(null)
    try {
      onCreated(
        await createStockVoucher({
          warehouseId,
          type,
          referenceNo: referenceNo.trim() || undefined,
          note: note.trim() || undefined,
          containerIds: selected.size > 0 ? [...selected] : undefined,
          confirm,
        }),
      )
    } catch (failure) {
      setError(errorText(failure, t('The voucher could not be created.')))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal title={t('New stock voucher')} onClose={onClose} width="w-[720px]">
      <div className="flex flex-col gap-4 px-6 py-5">
        <FieldRow>
          <Field label={t('Type')}>
            <select
              className={controlClass()}
              value={type}
              onChange={(event) => {
                setType(event.target.value as StockVoucherType)
                setSelected(new Set())
              }}
            >
              <option value="INBOUND">{t('Inbound (phiếu nhập)')}</option>
              <option value="OUTBOUND">{t('Outbound (phiếu xuất)')}</option>
            </select>
          </Field>
          <Field label={t('Warehouse')}>
            <select
              className={controlClass()}
              value={warehouseId}
              onChange={(event) => {
                setWarehouseId(event.target.value)
                setSelected(new Set())
              }}
            >
              {warehouses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code ? `${item.code} · ${item.name}` : item.name}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label={t('Reference no.')}>
            <input
              className={controlClass()}
              value={referenceNo}
              maxLength={100}
              placeholder={t('Supplier PO, sales order…')}
              onChange={(event) => setReferenceNo(event.target.value)}
            />
          </Field>
          <Field label={t('Note')}>
            <input className={controlClass()} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </FieldRow>
        <Field
          label={t('Containers')}
          hint={
            type === 'INBOUND'
              ? t('Received Containers not on a shelf yet. Robots put them away after the voucher is confirmed.')
              : t('Containers on a shelf of this warehouse. Stock comes off each one when a robot delivers it to an Outbound gate.')
          }
        >
          <ContainerPicker warehouseId={warehouseId} type={type} selected={selected} onChange={setSelected} />
        </Field>
        {error ? <FormError>{error}</FormError> : null}
      </div>
      <footer className="flex flex-wrap justify-end gap-2 px-6 pb-6">
        <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="tonal" disabled={busy !== null} onClick={() => void save(false)}>
          {busy === 'draft' ? t('Saving…') : t('Save as draft')}
        </Button>
        <Button variant="primary" disabled={busy !== null || selected.size === 0} onClick={() => void save(true)}>
          {busy === 'confirm' ? t('Saving…') : t('Create and confirm')}
        </Button>
      </footer>
    </Modal>
  )
}

/* ---------------------------------------------------------------------------------------------- detail */

function VoucherDetailModal({
  id,
  onChanged,
  onClose,
}: {
  id: string
  onChanged: () => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const detailQuery = useQuery({
    queryKey: [...VOUCHERS_KEY, 'detail', id],
    queryFn: () => getStockVoucher(id),
    // Robots fill the progress in after confirmation; poll until the voucher completes.
    refetchInterval: (q) => (q.state.data?.status === 'CONFIRMED' ? 4000 : false),
  })
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const voucher = detailQuery.data

  function apply(updated: StockVoucherDetail) {
    queryClient.setQueryData([...VOUCHERS_KEY, 'detail', id], updated)
    onChanged()
  }

  async function run(action: () => Promise<StockVoucherDetail>, fallback: string) {
    setBusy(true)
    setError(null)
    try {
      apply(await action())
    } catch (failure) {
      setError(errorText(failure, fallback))
    } finally {
      setBusy(false)
    }
  }

  if (!voucher) {
    return (
      <Modal title={t('Stock voucher')} onClose={onClose} width="w-[880px]">
        <p className="px-6 py-10 text-center text-sm text-muted">
          {detailQuery.isError ? errorText(detailQuery.error, t('The voucher could not be loaded.')) : t('Loading voucher…')}
        </p>
      </Modal>
    )
  }

  const draft = voucher.status === 'DRAFT'
  const confirmed = voucher.status === 'CONFIRMED'
  const remaining = voucher.lines.filter((line) => !line.done && !line.closedShort).length
  const dispatchable = voucher.lines.filter((line) => dispatchableLine(voucher.type, line)).length

  function closeShort() {
    if (!voucher) return
    const reason = window.prompt(
      t('Close {code} short: the {remaining} Containers not done leave the voucher. Why?', { code: voucher.code, remaining }),
    )
    if (reason && reason.trim()) {
      void run(() => closeStockVoucherShort(voucher.id, reason.trim()), t('The voucher could not be closed.'))
    }
  }

  return (
    <Modal
      title={`${voucher.type === 'INBOUND' ? 'Phiếu nhập' : 'Phiếu xuất'} ${voucher.code}`}
      subtitle={`${voucher.warehouseName}${voucher.referenceNo ? t(' · Ref {referenceNo}', { referenceNo: voucher.referenceNo }) : ''}`}
      onClose={onClose}
      width="w-[880px]"
    >
      <div className="flex flex-col gap-5 px-6 py-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <StatusBadge tone={VOUCHER_STATUS_TONE[voucher.status]} withDot>
            {VOUCHER_STATUS_LABEL[voucher.status]}
          </StatusBadge>
          <Progress done={voucher.doneCount} total={voucher.containerCount} type={voucher.type} />
          <span className="text-xs text-muted">{t('Created')}{' '}{formatIsoDateTime(voucher.createdAt)}</span>
          {voucher.confirmedAt ? <span className="text-xs text-muted">{t('Confirmed')}{' '}{formatIsoDateTime(voucher.confirmedAt)}</span> : null}
          {voucher.completedAt ? <span className="text-xs text-muted">{t('Completed')}{' '}{formatIsoDateTime(voucher.completedAt)}</span> : null}
          {voucher.cancelledAt ? <span className="text-xs text-muted">{t('Cancelled')}{' '}{formatIsoDateTime(voucher.cancelledAt)}</span> : null}
        </div>
        {voucher.note ? <p className="text-sm text-ink-2">{voucher.note}</p> : null}
        {voucher.closedShortAt ? (
          <p className="rounded-sm bg-container-high px-3 py-2 text-sm text-ink-2">
            {t('Closed short {date}: {reason}', { date: formatIsoDateTime(voucher.closedShortAt), reason: voucher.closedShortReason ?? '' })}
          </p>
        ) : null}
        {confirmed ? (
          <p className="text-xs text-muted">
            {voucher.type === 'INBOUND'
              ? t('Stock is added shelf by shelf as robots put each Container away. The voucher completes with the last one.')
              : t('Stock comes off each shelf when a robot delivers the Container to an Outbound gate. The voucher completes with the last one.')}
          </p>
        ) : null}

        {voucher.products.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {voucher.products.map((product) => (
              <span key={product.productId} className="rounded-full bg-container-high px-3 py-1 text-xs text-ink-2">
                <span className="font-mono">{product.productSku}</span> {product.productName} ·{' '}
                <span className="font-medium text-ink tabular-nums">{product.containerCount}</span>{' '}{t('Containers')}</span>
            ))}
          </div>
        ) : null}

        <div className="max-h-[360px] overflow-auto">
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>{t('Container')}</Th>
                <Th>{t('Product')}</Th>
                <Th>{t('Container status')}</Th>
                <Th>{t('Location')}</Th>
                <Th align="right">{draft ? '' : t('Done')}</Th>
              </tr>
            </thead>
            <tbody>
              {voucher.lines.map((line) => (
                <Tr key={line.id}>
                  <Td tone="faint">{line.lineNo}</Td>
                  <Td className={cx('font-mono text-xs', line.closedShort && 'line-through opacity-60')}>{line.containerBarcode}</Td>
                  <Td>
                    <span className="font-mono text-xs text-muted">{line.productSku}</span> {line.productName}
                  </Td>
                  <Td>
                    <StatusBadge tone={CONTAINER_STATUS_TONE[line.containerStatus] ?? 'grey'}>{line.containerStatus}</StatusBadge>
                  </Td>
                  <Td tone="faint">
                    {line.currentStorageLocationCode ?? '—'}
                    {line.currentLevelNo ? ` · L${line.currentLevelNo}` : ''}
                  </Td>
                  <Td align="right">
                    {draft ? (
                      <Can permission={PERMISSIONS.voucherWrite}>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void run(() => removeStockVoucherLine(voucher.id, line.id), t('The Container could not be removed.'))}
                        >{t('Remove')}</Button>
                      </Can>
                    ) : line.done ? (
                      <Icon name="check" size={16} className="ml-auto text-green-ink" />
                    ) : line.closedShort ? (
                      <span className="text-xs text-muted">{t('closed short')}</span>
                    ) : voucher.status === 'CANCELLED' ? (
                      <span className="text-xs text-muted">—</span>
                    ) : (
                      <span className="text-xs text-muted">{t('waiting')}</span>
                    )}
                  </Td>
                </Tr>
              ))}
              {voucher.lines.length === 0 ? (
                <EmptyRow colSpan={6}>
                  {voucher.type === 'INBOUND'
                    ? t('No Containers yet. Add received Containers, or scan goods into this voucher in the mobile app.')
                    : t('No Containers yet. Add Containers that are on a shelf.')}
                </EmptyRow>
              ) : null}
            </tbody>
          </Table>
        </div>

        {error ? <FormError>{error}</FormError> : null}
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2 px-6 pb-6">
        <Button variant="ghost" onClick={() => printVoucher(voucher)}>{t('Print')}</Button>
        {voucher.lines.length > 0 ? (
          <Button variant="ghost" onClick={() => printLabelSheet(voucher.lines.map((line) => ({ code: line.containerBarcode, qr: qrPayload('CONTAINER', line.containerBarcode), title: line.productName, subtitle: voucher.code })), voucher.code)}>
            {t('Print container labels')}
          </Button>
        ) : null}
        {draft ? (
          <Can permission={PERMISSIONS.voucherWrite}>
            <Button variant="ghost" disabled={busy} onClick={() => void run(() => cancelStockVoucher(voucher.id), t('The voucher could not be cancelled.'))}>{t('Cancel voucher')}</Button>
            <Button variant="tonal" disabled={busy} onClick={() => setAdding(true)}>
              <Icon name="plus" size={14} />{' '}{t('Add Containers')}</Button>
            <Button
              variant="primary"
              disabled={busy || voucher.lines.length === 0}
              onClick={() => void run(() => confirmStockVoucher(voucher.id), t('The voucher could not be confirmed.'))}
            >{t('Confirm voucher')}</Button>
          </Can>
        ) : null}
        {confirmed && remaining > 0 ? (
          <Can permission={PERMISSIONS.voucherWrite}>
            <Button variant="ghost" disabled={busy} onClick={closeShort}>{t('Close short')}</Button>
          </Can>
        ) : null}
        {confirmed && dispatchable > 0 ? (
          <Can permission={PERMISSIONS.transportCreate}>
            <Button variant="primary" onClick={() => navigate(`/monitor/requests?voucher=${voucher.id}`)}>{t('Dispatch robots ({remaining})', { remaining: dispatchable })}</Button>
          </Can>
        ) : null}
      </footer>

      {adding ? (
        <AddContainersDialog
          voucher={voucher}
          onClose={() => setAdding(false)}
          onAdded={(updated) => {
            setAdding(false)
            apply(updated)
          }}
        />
      ) : null}
    </Modal>
  )
}

/* ------------------------------------------------------------------------------------------ add containers */

function AddContainersDialog({
  voucher,
  onClose,
  onAdded,
}: {
  voucher: StockVoucherDetail
  onClose: () => void
  onAdded: (voucher: StockVoucherDetail) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onVoucher = useMemo(() => new Set(voucher.lines.map((line) => line.containerId)), [voucher.lines])

  async function save() {
    if (selected.size === 0) {
      setError(t('Select at least one Container.'))
      return
    }

    setBusy(true)
    setError(null)
    try {
      onAdded(await addStockVoucherLines(voucher.id, { containerIds: [...selected] }))
    } catch (failure) {
      setError(errorText(failure, t('The Containers could not be added.')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={t('Add Containers to {code}', { code: voucher.code })}
      submitLabel={t('Add')}
      busy={busy}
      width="w-[680px]"
      onClose={onClose}
      onSubmit={save}
    >
      <ContainerPicker
        warehouseId={voucher.warehouseId}
        type={voucher.type}
        exclude={onVoucher}
        selected={selected}
        onChange={setSelected}
      />
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  )
}

/* ------------------------------------------------------------------------------------------ container picker */

/**
 * The Containers a voucher of this type may name. Inbound: received ones (CREATED / PACKED) not on a shelf yet.
 * Outbound: ones STORED on a shelf. A Container a robot is moving, or already on another live voucher of the same type,
 * stays listed (so staff see why) but cannot be ticked.
 */
function ContainerPicker({
  warehouseId,
  type,
  exclude,
  selected,
  onChange,
}: {
  warehouseId: string
  type: StockVoucherType
  exclude?: Set<string>
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [search, setSearch] = useState('')
  const containersQuery = useQuery({
    queryKey: ['warehouse', 'containers', 'eligible', warehouseId],
    queryFn: () => listContainers({ warehouseId, eligibleOnly: true, take: 500 }),
    enabled: Boolean(warehouseId),
  })

  const candidates = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (containersQuery.data?.items ?? [])
      .filter(
        (container) =>
          !exclude?.has(container.id) &&
          (type === 'INBOUND'
            ? (container.status === 'CREATED' || container.status === 'PACKED') && container.currentStorageLocationId === null
            : container.status === 'STORED' && container.currentStorageLocationId !== null) &&
          (needle === '' ||
            container.barcode.toLowerCase().includes(needle) ||
            container.productSku.toLowerCase().includes(needle) ||
            container.productName.toLowerCase().includes(needle)),
      )
      .map((container) => ({ container, blocked: pickBlock(container, type) }))
      .sort((a, b) => Number(Boolean(a.blocked)) - Number(Boolean(b.blocked)))
  }, [containersQuery.data, exclude, type, search])
  const free = candidates.filter((item) => !item.blocked).length

  function toggle(containerId: string) {
    const next = new Set(selected)
    if (next.has(containerId)) next.delete(containerId)
    else next.add(containerId)
    onChange(next)
  }

  function selectAllFree() {
    onChange(new Set([...selected, ...candidates.filter((item) => !item.blocked).map((item) => item.container.id)]))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <SearchInput variant="field" className="flex-1" placeholder={t('Search barcode, SKU or product')} value={search} onChange={setSearch} />
        <Button size="sm" variant="ghost" disabled={free === 0} onClick={selectAllFree}>{t('Select all')}</Button>
      </div>
      <div className="max-h-72 overflow-auto rounded-sm border border-outline-soft">
        {containersQuery.isLoading ? <p className="px-3 py-6 text-center text-xs text-muted">{t('Loading Containers…')}</p> : null}
        {containersQuery.isError ? <p className="px-3 py-6 text-center text-xs text-red-ink">{t('Could not load Containers.')}</p> : null}
        {containersQuery.isSuccess && candidates.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted">
            {type === 'INBOUND' ? t('No received Container waiting for putaway.') : t('No Container on a shelf to ship.')}
          </p>
        ) : null}
        {candidates.map(({ container, blocked }) => (
          <label
            key={container.id}
            className={cx(
              'flex items-start gap-3 border-b border-outline-soft px-3 py-2.5 text-xs last:border-b-0',
              blocked ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-container',
            )}
            title={blocked ?? undefined}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={!blocked && selected.has(container.id)}
              disabled={Boolean(blocked)}
              onChange={() => toggle(container.id)}
            />
            <span className={cx('flex min-w-0 flex-1 flex-col gap-0.5', blocked && 'opacity-60')}>
              <span className="flex items-center justify-between gap-3">
                <span className="font-mono font-medium text-ink">{container.barcode}</span>
                {container.inActiveTransport ? (
                  <StatusBadge tone="amber">{t('In transport request')}</StatusBadge>
                ) : blocked ? (
                  <StatusBadge tone="grey">{container.voucher?.code ?? ''}</StatusBadge>
                ) : (
                  <span className="shrink-0 text-muted">
                    {container.currentStorageLocationCode
                      ? `${container.currentStorageLocationCode}${container.currentLevelNo ? ` · L${container.currentLevelNo}` : ''}`
                      : t('Not on a shelf')}
                  </span>
                )}
              </span>
              <span className="text-ink-2">
                {container.productName} <span className="font-mono text-muted">{container.productSku}</span>
              </span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">
        {t('{size} selected · {free} free', { size: selected.size, free })}
        {candidates.length > free ? t(' · {value} busy', { value: candidates.length - free }) : ''}
      </p>
    </div>
  )
}

/** Why this Container cannot be ticked for a voucher of this type, or null. */
function pickBlock(container: ContainerListItem, type: StockVoucherType): string | null {
  if (container.inActiveTransport) return t('A robot is already moving this Container on another Transport Request.')
  const voucher = container.voucher
  if (voucher && voucher.type === type && (voucher.status === 'DRAFT' || voucher.status === 'CONFIRMED')) {
    return t('Already on voucher {code}.', { code: voucher.code })
  }
  return null
}

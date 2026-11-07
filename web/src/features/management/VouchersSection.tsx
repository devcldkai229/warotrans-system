import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Product } from '@/shared/api/contracts'
import {
  addStockVoucherLines,
  cancelStockVoucher,
  confirmStockVoucher,
  createStockVoucher,
  getStockVoucher,
  listContainers,
  listWarehouses,
  removeStockVoucherLine,
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
import { AddButton, SectionHead, SectionNote } from './SectionHead'
import {
  VOUCHER_STATUS_TONE,
  VOUCHER_TYPE_LABEL,
  VOUCHER_TYPE_TONE,
  VOUCHERS_KEY,
  doneLabel,
  printVoucher,
  useStockVouchers,
} from './stockVouchers'

function errorText(failure: unknown, fallback: string): string {
  return failure instanceof Error && failure.message ? failure.message : fallback
}

interface VouchersSectionProps {
  /** The working Warehouse, shown first; null when no active one exists yet. */
  warehouse: { id: string; name: string } | null
  products: Product[]
}

type WarehouseOption = { id: string; code: string; name: string }

/**
 * warehouse.stock_vouchers: phiếu nhập (INBOUND) and phiếu xuất (OUTBOUND). The quantity is a Container count, one line
 * per Container. The status is set by people only (DRAFT → CONFIRMED, or CANCELLED); robot progress is read from the
 * Containers (on a shelf / issued) and never changes it. A Container goes onto or off a shelf only on a CONFIRMED voucher.
 */
export function VouchersSection({ warehouse, products }: VouchersSectionProps) {
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
        title="Stock vouchers"
        hint={`Phiếu nhập and phiếu xuất${current ? ` of ${current.name}` : ''}. Quantities are Containers, not units.`}
      >
        <select
          className={controlClass('pill', 'shrink-0')}
          aria-label="Warehouse"
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
          <option value="">All types</option>
          <option value="INBOUND">Inbound</option>
          <option value="OUTBOUND">Outbound</option>
        </select>
        <select className={controlClass('pill', 'shrink-0')} value={status} onChange={(event) => setStatus(event.target.value as StockVoucherStatus | '')}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <SearchInput className="w-48" placeholder="Search code or reference" value={query} onChange={setQuery} />
        {warehouseId ? <AddButton onClick={() => setCreating(true)}>New voucher</AddButton> : null}
      </SectionHead>

      <Table>
        <thead>
          <tr>
            <Th>Code</Th>
            <Th>Type</Th>
            <Th>Reference</Th>
            <Th>Status</Th>
            <Th align="right">Containers</Th>
            <Th>Progress</Th>
            <Th align="right">Created</Th>
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
                  {voucher.status}
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
                ? 'Loading vouchers…'
                : vouchersQuery.isError
                  ? 'Could not load vouchers. Check that the API is running, then reload.'
                  : !warehouseId
                    ? 'No active warehouse yet, so there are no vouchers.'
                    : vouchers.length === 0
                      ? 'No vouchers yet. Create the first phiếu nhập.'
                      : 'No voucher matches these filters.'}
            </EmptyRow>
          ) : null}
        </tbody>
      </Table>
      <SectionNote>
        Confirming a voucher does not wait for robots: progress fills in as Containers reach a shelf (inbound) or are issued
        at the outbound dock (outbound). Only a draft can be changed or cancelled.
      </SectionNote>

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
          products={products}
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      onCreated(
        await createStockVoucher({
          warehouseId,
          type,
          referenceNo: referenceNo.trim() || undefined,
          note: note.trim() || undefined,
        }),
      )
    } catch (failure) {
      setError(errorText(failure, 'The voucher could not be created.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="New stock voucher" submitLabel="Create draft" busy={busy} onClose={onClose} onSubmit={save}>
      <Field label="Type">
        <select className={controlClass()} value={type} onChange={(event) => setType(event.target.value as StockVoucherType)}>
          <option value="INBOUND">Inbound (phiếu nhập)</option>
          <option value="OUTBOUND">Outbound (phiếu xuất)</option>
        </select>
      </Field>
      <Field label="Warehouse">
        <select className={controlClass()} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
          {warehouses.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code ? `${item.code} · ${item.name}` : item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Reference no.">
        <input
          className={controlClass()}
          value={referenceNo}
          maxLength={100}
          placeholder="Supplier PO, sales order…"
          onChange={(event) => setReferenceNo(event.target.value)}
        />
      </Field>
      <Field label="Note">
        <textarea className={controlClass('area')} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  )
}

/* ---------------------------------------------------------------------------------------------- detail */

function VoucherDetailModal({
  id,
  products,
  onChanged,
  onClose,
}: {
  id: string
  products: Product[]
  onChanged: () => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const detailQuery = useQuery({
    queryKey: [...VOUCHERS_KEY, 'detail', id],
    queryFn: () => getStockVoucher(id),
    // Robots fill the progress in after confirmation; poll until every Container is done.
    refetchInterval: (q) =>
      q.state.data?.status === 'CONFIRMED' && q.state.data.doneCount < q.state.data.containerCount ? 4000 : false,
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
      <Modal title="Stock voucher" onClose={onClose} width="w-[880px]">
        <p className="px-6 py-10 text-center text-sm text-muted">
          {detailQuery.isError ? errorText(detailQuery.error, 'The voucher could not be loaded.') : 'Loading voucher…'}
        </p>
      </Modal>
    )
  }

  const draft = voucher.status === 'DRAFT'
  const remaining = voucher.lines.filter((line) => !line.done).length

  return (
    <Modal
      title={`${voucher.type === 'INBOUND' ? 'Phiếu nhập' : 'Phiếu xuất'} ${voucher.code}`}
      subtitle={`${voucher.warehouseName}${voucher.referenceNo ? ` · Ref ${voucher.referenceNo}` : ''}`}
      onClose={onClose}
      width="w-[880px]"
    >
      <div className="flex flex-col gap-5 px-6 py-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <StatusBadge tone={VOUCHER_STATUS_TONE[voucher.status]} withDot>
            {voucher.status}
          </StatusBadge>
          <Progress done={voucher.doneCount} total={voucher.containerCount} type={voucher.type} />
          <span className="text-xs text-muted">Created {formatIsoDateTime(voucher.createdAt)}</span>
          {voucher.confirmedAt ? <span className="text-xs text-muted">Confirmed {formatIsoDateTime(voucher.confirmedAt)}</span> : null}
          {voucher.cancelledAt ? <span className="text-xs text-muted">Cancelled {formatIsoDateTime(voucher.cancelledAt)}</span> : null}
        </div>
        {voucher.note ? <p className="text-sm text-ink-2">{voucher.note}</p> : null}

        {voucher.products.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {voucher.products.map((product) => (
              <span key={product.productId} className="rounded-full bg-container-high px-3 py-1 text-xs text-ink-2">
                <span className="font-mono">{product.productSku}</span> {product.productName} ·{' '}
                <span className="font-medium text-ink tabular-nums">{product.containerCount}</span> Containers
              </span>
            ))}
          </div>
        ) : null}

        <div className="max-h-[360px] overflow-auto">
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Container</Th>
                <Th>Product</Th>
                <Th>Container status</Th>
                <Th>Location</Th>
                <Th align="right">{draft ? '' : 'Done'}</Th>
              </tr>
            </thead>
            <tbody>
              {voucher.lines.map((line) => (
                <Tr key={line.id}>
                  <Td tone="faint">{line.lineNo}</Td>
                  <Td className="font-mono text-xs">{line.containerBarcode}</Td>
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
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void run(() => removeStockVoucherLine(voucher.id, line.id), 'The Container could not be removed.')}
                      >
                        Remove
                      </Button>
                    ) : line.done ? (
                      <Icon name="check" size={16} className="ml-auto text-green-ink" />
                    ) : (
                      <span className="text-xs text-muted">waiting</span>
                    )}
                  </Td>
                </Tr>
              ))}
              {voucher.lines.length === 0 ? (
                <EmptyRow colSpan={6}>
                  {voucher.type === 'INBOUND'
                    ? 'No Containers yet. Add received Containers, or scan goods into this voucher in the mobile app.'
                    : 'No Containers yet. Pick stored Containers by product or one by one.'}
                </EmptyRow>
              ) : null}
            </tbody>
          </Table>
        </div>

        {error ? <FormError>{error}</FormError> : null}
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2 px-6 pb-6">
        <Button variant="ghost" onClick={() => printVoucher(voucher)}>
          Print
        </Button>
        {draft ? (
          <>
            <Button variant="ghost" disabled={busy} onClick={() => void run(() => cancelStockVoucher(voucher.id), 'The voucher could not be cancelled.')}>
              Cancel voucher
            </Button>
            <Button variant="tonal" disabled={busy} onClick={() => setAdding(true)}>
              <Icon name="plus" size={14} /> Add Containers
            </Button>
            <Button
              variant="primary"
              disabled={busy || voucher.lines.length === 0}
              onClick={() => void run(() => confirmStockVoucher(voucher.id), 'The voucher could not be confirmed.')}
            >
              Confirm voucher
            </Button>
          </>
        ) : null}
        {voucher.status === 'CONFIRMED' && remaining > 0 ? (
          <Button variant="primary" onClick={() => navigate(`/monitor/requests?voucher=${voucher.id}`)}>
            Dispatch robots ({remaining})
          </Button>
        ) : null}
      </footer>

      {adding ? (
        <AddContainersDialog
          voucher={voucher}
          warehouseId={voucher.warehouseId}
          products={products}
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
  warehouseId,
  products,
  onClose,
  onAdded,
}: {
  voucher: StockVoucherDetail
  warehouseId: string
  products: Product[]
  onClose: () => void
  onAdded: (voucher: StockVoucherDetail) => void
}) {
  const inbound = voucher.type === 'INBOUND'
  const [mode, setMode] = useState<'pick' | 'product'>(inbound ? 'pick' : 'product')
  const [productId, setProductId] = useState(products.find((product) => product.isActive)?.id ?? '')
  const [count, setCount] = useState('1')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const containersQuery = useQuery({
    queryKey: ['warehouse', 'containers', 'eligible', warehouseId],
    queryFn: () => listContainers({ warehouseId, eligibleOnly: true, take: 500 }),
    enabled: mode === 'pick',
  })

  const onVoucher = useMemo(() => new Set(voucher.lines.map((line) => line.containerId)), [voucher.lines])
  // Inbound takes received Containers that are not on a shelf yet; outbound takes shelved ones of this warehouse.
  // Containers a robot is already moving stay listed (so staff see why they are missing) but cannot be ticked.
  const candidates = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (containersQuery.data?.items ?? [])
      .filter(
        (container) =>
          !onVoucher.has(container.id) &&
          (inbound
            ? (container.status === 'CREATED' || container.status === 'PACKED') && container.currentStorageLocationId === null
            : container.status === 'STORED' && container.currentStorageLocationId !== null) &&
          (needle === '' ||
            container.barcode.toLowerCase().includes(needle) ||
            container.productSku.toLowerCase().includes(needle) ||
            container.productName.toLowerCase().includes(needle)),
      )
      .sort((a, b) => Number(a.inActiveTransport) - Number(b.inActiveTransport))
  }, [containersQuery.data, onVoucher, inbound, search])
  const free = candidates.filter((container) => !container.inActiveTransport).length

  function toggle(containerId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(containerId)) next.delete(containerId)
      else next.add(containerId)
      return next
    })
  }

  async function save() {
    const amount = Number(count)
    if (mode === 'product' && (!productId || !Number.isInteger(amount) || amount < 1 || amount > 200)) {
      setError('Choose a product and a count between 1 and 200.')
      return
    }
    if (mode === 'pick' && selected.size === 0) {
      setError('Select at least one Container.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      onAdded(
        await addStockVoucherLines(
          voucher.id,
          mode === 'product' ? { productId, count: amount } : { containerIds: [...selected] },
        ),
      )
    } catch (failure) {
      setError(errorText(failure, 'The Containers could not be added.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={`Add Containers to ${voucher.code}`}
      submitLabel="Add"
      busy={busy}
      width="w-[680px]"
      onClose={onClose}
      onSubmit={save}
    >
      {!inbound ? (
        <Field label="How">
          <select className={controlClass()} value={mode} onChange={(event) => setMode(event.target.value as 'pick' | 'product')}>
            <option value="product">By product, oldest stored first (FIFO)</option>
            <option value="pick">Pick Containers one by one</option>
          </select>
        </Field>
      ) : null}

      {mode === 'product' ? (
        <FieldRow>
          <Field label="Product">
            <select className={controlClass()} value={productId} onChange={(event) => setProductId(event.target.value)}>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} · {product.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Containers" hint="Stored in this warehouse and not on another live phiếu xuất.">
            <input className={controlClass()} type="number" min={1} max={200} value={count} onChange={(event) => setCount(event.target.value)} />
          </Field>
        </FieldRow>
      ) : (
        <>
          <SearchInput variant="field" placeholder="Search barcode, SKU or product" value={search} onChange={setSearch} />
          <div className="max-h-96 overflow-auto rounded-sm border border-outline-soft">
            {containersQuery.isLoading ? <p className="px-3 py-6 text-center text-xs text-muted">Loading Containers…</p> : null}
            {containersQuery.isError ? <p className="px-3 py-6 text-center text-xs text-red-ink">Could not load Containers.</p> : null}
            {containersQuery.isSuccess && candidates.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted">
                {inbound ? 'No received Container waiting for putaway.' : 'No stored Container left to pick.'}
              </p>
            ) : null}
            {candidates.map((container) => (
              <label
                key={container.id}
                className={cx(
                  'flex items-start gap-3 border-b border-outline-soft px-3 py-2.5 text-xs last:border-b-0',
                  container.inActiveTransport ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-container',
                )}
                title={container.inActiveTransport ? 'A robot is already moving this Container on another Transport Request.' : undefined}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={selected.has(container.id)}
                  disabled={container.inActiveTransport}
                  onChange={() => toggle(container.id)}
                />
                <span className={cx('flex min-w-0 flex-1 flex-col gap-0.5', container.inActiveTransport && 'opacity-60')}>
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-mono font-medium text-ink">{container.barcode}</span>
                    {container.inActiveTransport ? (
                      <StatusBadge tone="amber">In transport request</StatusBadge>
                    ) : (
                      <span className="shrink-0 text-muted">
                        {container.currentStorageLocationCode
                          ? `${container.currentStorageLocationCode}${container.currentLevelNo ? ` · L${container.currentLevelNo}` : ''}`
                          : 'Not on a shelf'}
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
            {selected.size} selected · {free} free
            {candidates.length > free ? ` · ${candidates.length - free} busy in a transport request` : ''}
          </p>
        </>
      )}
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  )
}

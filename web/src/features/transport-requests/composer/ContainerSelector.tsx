import { useMemo, useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { SearchInput } from '@/shared/ui/Field'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { CONTAINER_STATUS_TONE } from '@/shared/ui/statusTones'
import { controlClass } from '@/shared/ui/controlClass'
import { cx } from '@/shared/lib/cx'
import { humanize } from '@/shared/lib/format'
import type { ComposerContainer, ComposerData } from './types'
import { groupContainers, ineligibleReason } from './containerEligibility'
import { t } from '@/shared/i18n'

interface ContainerSelectorProps {
  data: ComposerData
  excludeIds: Set<string>
  onCancel: () => void
  onAdd: (containers: ComposerContainer[]) => void
}

const KIND_HINT: Record<string, string> = {
  INBOUND: 'Containers of confirmed receiving vouchers come first, newest voucher on top.',
  OUTBOUND: 'Containers of confirmed issue vouchers come first, newest voucher on top.',
  INTERNAL: 'Containers on shelves, grouped by shelf.',
}

function placeOf(item: ComposerContainer): string {
  if (item.currentLocationCode) {
    return item.currentLevelNo != null
      ? t('Shelf {shelf} · level {level}', { shelf: item.currentLocationCode, level: item.currentLevelNo })
      : t('Shelf {shelf}', { shelf: item.currentLocationCode })
  }
  return item.currentEndpointName ?? t('No place yet')
}

export function ContainerSelector({ data, excludeIds, onCancel, onAdd }: ContainerSelectorProps) {
  const [statusFilter, setStatusFilter] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const kind = data.workflowKind

  const products = useMemo(() => [...new Set(data.containers.map((item) => item.productName))].sort(), [data.containers])
  const statuses = useMemo(() => [...new Set(data.containers.map((item) => item.status))].sort(), [data.containers])

  const rows = useMemo(
    () =>
      data.containers.filter((item) => {
        if (excludeIds.has(item.id)) return false
        if (statusFilter && item.status !== statusFilter) return false
        if (productFilter && item.productName !== productFilter) return false
        return true
      }),
    [data.containers, excludeIds, statusFilter, productFilter],
  )
  const groups = useMemo(() => groupContainers(rows, kind), [rows, kind])

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll(items: ComposerContainer[]) {
    setSelected((current) => {
      const next = new Set(current)
      for (const item of items) if (!ineligibleReason(item, kind)) next.add(item.id)
      return next
    })
  }

  const picked = rows.filter((item) => selected.has(item.id) && !ineligibleReason(item, kind))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 space-y-3 border-b border-outline/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">{t('Select containers')}</h2>
          {kind ? <p className="mt-0.5 text-xs text-muted">{t(KIND_HINT[kind])}</p> : null}
        </div>
        <SearchInput
          variant="field"
          value={data.containerSearch}
          onChange={data.setContainerSearch}
          placeholder={t('code / product / barcode')}
        />
        <div className="grid grid-cols-2 gap-2">
          <select className={controlClass('sm')} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{t('Status')}</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {humanize(status)}
              </option>
            ))}
          </select>
          <select className={controlClass('sm')} value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
            <option value="">{t('Product')}</option>
            {products.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-3 py-3">
        {groups.length === 0 ? <p className="px-1 text-xs text-muted">{t('No containers match.')}</p> : null}
        {groups.map((group) => {
          const eligible = group.items.filter((item) => !ineligibleReason(item, kind))
          return (
            <section key={group.key} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <h3 className={cx('text-xs font-medium', group.voucher && 'font-mono')}>
                  {group.voucher ? group.title : t(group.title)}
                </h3>
                <span className="text-[11px] text-muted">{t('{count} containers', { count: group.items.length })}</span>
                {group.voucher && eligible.length > 0 ? (
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => selectAll(group.items)}>
                    {t('Select whole voucher')}
                  </Button>
                ) : null}
              </div>
              {group.items.map((item) => {
                const reason = ineligibleReason(item, kind)
                return (
                  <label
                    key={item.id}
                    className={cx(
                      'flex gap-3 rounded-md bg-surface px-3 py-2.5',
                      reason ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:shadow-float',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={Boolean(reason)}
                      checked={!reason && selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-medium">{item.barcode}</span>
                        <StatusBadge tone={CONTAINER_STATUS_TONE[item.status]}>{item.status}</StatusBadge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-2">{item.productName}</p>
                      <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted">
                        <span>{placeOf(item)}</span>
                        {item.voucher ? (
                          <span className="font-mono">
                            {item.voucher.code} · {humanize(item.voucher.status)}
                          </span>
                        ) : null}
                      </p>
                      {reason ? <p className="mt-1 text-[11px] text-red-ink">{t(reason)}</p> : null}
                    </div>
                  </label>
                )
              })}
            </section>
          )
        })}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-outline/60 px-4 py-3">
        <span className="text-xs text-muted">
          {t('Selected:')} {picked.length}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button variant="primary" size="sm" disabled={picked.length === 0} onClick={() => onAdd(picked)}>
          {t('Add {value} container{value2}', { value: picked.length || '', value2: picked.length === 1 ? '' : 's' })}
        </Button>
      </footer>
    </div>
  )
}

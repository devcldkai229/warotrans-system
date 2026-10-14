import { useMemo, useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { SearchInput } from '@/shared/ui/Field'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { CONTAINER_STATUS_TONE } from '@/shared/ui/statusTones'
import { controlClass } from '@/shared/ui/controlClass'
import { humanize } from '@/shared/lib/format'
import type { ComposerContainer, ComposerData } from './types'

interface ContainerSelectorProps {
  data: ComposerData
  excludeIds: Set<string>
  onCancel: () => void
  onAdd: (containers: ComposerContainer[]) => void
}

export function ContainerSelector({ data, excludeIds, onCancel, onAdd }: ContainerSelectorProps) {
  const [query, setQuery] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const products = useMemo(
    () => [...new Set(data.containers.map((item) => item.productName))].sort(),
    [data.containers],
  )
  const statuses = useMemo(
    () => [...new Set(data.containers.map((item) => item.status))].sort(),
    [data.containers],
  )
  const locations = useMemo(
    () =>
      [...new Set(data.containers.map((item) => item.currentLocationCode).filter(Boolean) as string[])].sort(),
    [data.containers],
  )

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return data.containers.filter((item) => {
      if (excludeIds.has(item.id)) return false
      if (locationFilter && item.currentLocationCode !== locationFilter) return false
      if (statusFilter && item.status !== statusFilter) return false
      if (productFilter && item.productName !== productFilter) return false
      if (!needle) return true
      return (
        item.barcode.toLowerCase().includes(needle) ||
        item.productName.toLowerCase().includes(needle) ||
        item.sku.toLowerCase().includes(needle) ||
        (item.currentEndpointCode?.toLowerCase().includes(needle) ?? false)
      )
    })
  }, [data.containers, excludeIds, locationFilter, statusFilter, productFilter, query])

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const picked = rows.filter((item) => selected.has(item.id))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 space-y-3 border-b border-outline/60 px-4 py-3">
        <h2 className="text-sm font-medium">Select containers</h2>
        <SearchInput
          variant="field"
          value={query}
          onChange={setQuery}
          placeholder="code / product / barcode"
        />
        <div className="grid grid-cols-3 gap-2">
          <select className={controlClass('sm')} value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
            <option value="">Location</option>
            {locations.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <select className={controlClass('sm')} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Status</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {humanize(status)}
              </option>
            ))}
          </select>
          <select className={controlClass('sm')} value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
            <option value="">Product</option>
            {products.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto px-3 py-3">
        {rows.length === 0 ? <p className="px-1 text-xs text-muted">No containers match.</p> : null}
        {rows.map((item) => (
          <label
            key={item.id}
            className="flex cursor-pointer gap-3 rounded-md bg-surface px-3 py-2.5 hover:shadow-float"
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={selected.has(item.id)}
              onChange={() => toggle(item.id)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-medium">{item.barcode}</span>
                <StatusBadge tone={CONTAINER_STATUS_TONE[item.status]}>{item.status}</StatusBadge>
              </div>
              <p className="mt-0.5 truncate text-xs text-ink-2">{item.productName}</p>
              <p className="mt-1 text-[11px] text-muted">
                Current:{' '}
                {item.currentLocationCode
                  ? `${item.currentLocationCode}${item.currentLevelNo != null ? ` · L${item.currentLevelNo}` : ''}`
                  : item.currentEndpointName ?? '—'}
              </p>
            </div>
          </label>
        ))}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-outline/60 px-4 py-3">
        <span className="text-xs text-muted">Selected: {picked.length}</span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={picked.length === 0}
          onClick={() => onAdd(picked)}
        >
          Add {picked.length || ''} container{picked.length === 1 ? '' : 's'}
        </Button>
      </footer>
    </div>
  )
}

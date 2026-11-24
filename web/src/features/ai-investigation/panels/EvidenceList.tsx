import { useEffect, useMemo, useRef, useState } from 'react'
import type { EvidenceItem } from '@/shared/api/ai'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { controlClass } from '@/shared/ui/controlClass'
import { fmtTime } from '../model/labels'

/** Every evidence item of the frozen manifest; the selected one is highlighted and scrolled into view. */
export function EvidenceList({ items, selected, onSelect }: { items: EvidenceItem[]; selected: string | null; onSelect: (id: string, at: string) => void }) {
  const [filter, setFilter] = useState('')
  const [hideSnapshots, setHideSnapshots] = useState(true)
  const rowRef = useRef<Record<string, HTMLLIElement | null>>({})
  const shown = useMemo(() => items
    .filter((i) => !hideSnapshots || i.attributes.event !== 'snapshot' || i.id === selected)
    .filter((i) => !filter || `${i.id} ${i.summary} ${i.robot ?? ''} ${i.kind}`.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.at.localeCompare(b.at)), [items, filter, hideSnapshots, selected])
  useEffect(() => { if (selected) rowRef.current[selected]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [selected])
  return (
    <section className="rounded-md border border-outline bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{t('Evidence')} <span className="text-muted">({items.length})</span></h2>
        <input className={cx(controlClass(), 'ml-auto h-8 w-48')} placeholder={t('Filter…')} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label className="flex items-center gap-1 text-xs text-ink-2">
          <input type="checkbox" checked={hideSnapshots} onChange={(e) => setHideSnapshots(e.target.checked)} /> {t('hide periodic snapshots')}
        </label>
      </div>
      <ul className="max-h-80 overflow-auto text-xs">
        {shown.map((i) => (
          <li key={i.id} ref={(el) => { rowRef.current[i.id] = el }}
            className={cx('grid cursor-pointer grid-cols-[64px_110px_1fr] gap-2 border-b border-outline/50 px-1 py-1', i.id === selected ? 'bg-amber-soft' : 'hover:bg-container')}
            onClick={() => onSelect(i.id, i.at)}>
            <span className="font-mono text-ink-2">{fmtTime(i.at)}</span>
            <span className="truncate text-ink-2">{i.kind}{i.robot ? ` · ${i.robot}` : ''}</span>
            <span>
              {i.summary} <span className="font-mono text-[10px] text-muted">{i.id}</span>
              {i.untrusted_text && <span className="mt-0.5 block rounded bg-rose-soft px-1 text-[10px] text-rose-ink">{t('untrusted log text (treated as data)')}: {i.untrusted_text.slice(0, 120)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

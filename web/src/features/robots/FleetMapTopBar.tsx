import type { MapVersionDto } from '@/shared/api/navigation'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { humanize } from '@/shared/lib/format'
import { controlClass } from '@/shared/ui/controlClass'

export interface FleetMapTopBarProps {
  warehouses: { id: string; code: string; name: string }[]
  warehouseId: string
  onWarehouseChange: (id: string) => void
  maps: MapVersionDto[]
  mapVersionId: string
  onMapVersionChange: (id: string) => void
  activeMapId?: string | null
  trafficLive: boolean
  trafficEpoch?: number | null
}

function formatMapOption(m: MapVersionDto, isActive: boolean): string {
  const versionSuffix = `v${m.versionNo}`
  const base = m.code.toUpperCase().endsWith(versionSuffix.toUpperCase())
    ? m.code
    : `${m.code} · ${versionSuffix}`
  const statusTag = m.status === 'PUBLISHED' ? '' : ` · ${humanize(String(m.status))}`
  return `${base}${statusTag}${isActive ? ' ★' : ''}`
}

/** Single-row frosted HUD pill combining live traffic indicator, warehouse selector, map version, and epoch. */
export function FleetMapTopBar({
  warehouses,
  warehouseId,
  onWarehouseChange,
  maps,
  mapVersionId,
  onMapVersionChange,
  activeMapId,
  trafficLive,
  trafficEpoch,
}: FleetMapTopBarProps) {
  return (
    <div
      data-map-ui
      className="pointer-events-auto absolute top-3 left-3 z-5 flex h-9 max-w-[calc(100%-108px)] items-center gap-1.5 overflow-hidden rounded-full border border-[var(--otto-hud-border)] bg-[var(--otto-hud-bg)] px-2.5 text-xs text-ink shadow-float backdrop-blur-md"
    >
      <span className="inline-flex shrink-0 items-center gap-1.5 pr-0.5 whitespace-nowrap">
        <span
          className={cx('size-2 rounded-full', trafficLive ? 'bg-green' : 'bg-amber')}
          aria-hidden="true"
        />
        <span className="text-[11px] font-medium text-ink-2">
          {trafficLive ? t('Live') : t('Polling')}
        </span>
      </span>

      <span className="h-3.5 w-px shrink-0 bg-outline-soft" aria-hidden="true" />

      <label className="flex shrink-0 items-center gap-1 whitespace-nowrap">
        <span className="text-[11px] font-medium text-muted">{t('WH')}</span>
        <select
          className={cx(
            controlClass(),
            'h-7 w-auto min-w-0 cursor-pointer border-0 bg-transparent px-1 py-0 text-xs font-medium text-ink shadow-none focus:ring-0',
          )}
          value={warehouseId}
          onChange={(e) => onWarehouseChange(e.target.value)}
          aria-label={t('Warehouse')}
        >
          {warehouses.length === 0 ? <option value="">{t('No warehouse')}</option> : null}
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code}
            </option>
          ))}
        </select>
      </label>

      <span className="h-3.5 w-px shrink-0 bg-outline-soft" aria-hidden="true" />

      <label className="flex min-w-0 items-center whitespace-nowrap">
        <select
          className={cx(
            controlClass(),
            'h-7 w-auto max-w-48 min-w-0 cursor-pointer truncate border-0 bg-transparent px-1 py-0 text-xs font-medium text-ink shadow-none focus:ring-0',
          )}
          value={mapVersionId}
          onChange={(e) => onMapVersionChange(e.target.value)}
          aria-label={t('Map version')}
          disabled={maps.length === 0}
        >
          {maps.length === 0 ? <option value="">{t('No map versions')}</option> : null}
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {formatMapOption(m, activeMapId === m.id)}
            </option>
          ))}
        </select>
      </label>

      {trafficEpoch != null ? (
        <>
          <span className="h-3.5 w-px shrink-0 bg-outline-soft" aria-hidden="true" />
          <span
            className="shrink-0 rounded-full bg-container-high/80 px-2 py-0.5 font-mono text-[11px] font-medium text-ink-2 tabular-nums whitespace-nowrap"
            title={t('Traffic coordinator epoch')}
          >
            e{trafficEpoch}
          </span>
        </>
      ) : null}
    </div>
  )
}

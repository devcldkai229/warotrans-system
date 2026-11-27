import { cx } from '@/shared/lib/cx'
import type { MapVersionDto } from '@/shared/api/navigation'
import { controlClass } from '@/shared/ui/controlClass'
import { t } from '@/shared/i18n'
interface MapVersionToolbarProps {

  warehouses: { id: string; code: string; name: string }[]
  warehouseId: string
  onWarehouseChange: (id: string) => void
  maps: MapVersionDto[]
  mapVersionId: string
  onMapVersionChange: (id: string) => void
  activeMapId?: string | null
  className?: string
  /** Hide warehouse select when the page already scopes to one warehouse. */
  showWarehouse?: boolean
}

/** Floating warehouse + map version picker for monitor maps. */
export function MapVersionToolbar({
  warehouses,
  warehouseId,
  onWarehouseChange,
  maps,
  mapVersionId,
  onMapVersionChange,
  activeMapId,
  className,
  showWarehouse = true,
}: MapVersionToolbarProps) {
  return (
    <div
      data-map-ui
      className={cx(
        'absolute top-3 left-1/2 z-5 -translate-x-1/2 flex flex-nowrap items-center gap-2 whitespace-nowrap rounded-full border border-[var(--otto-hud-border)] bg-[var(--otto-hud-bg)] py-1.5 pr-2 pl-3 text-xs text-ink-2 shadow-float backdrop-blur-md',
        className,
      )}
    >
      {showWarehouse ? (
        <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <span className="text-muted">{t('WH')}</span>
          <select
            className={cx(controlClass(), 'h-7 min-w-24 border-0 bg-transparent py-0 text-xs shadow-none')}
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
      ) : null}
      <label className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
        <span className="text-muted">{t('Map')}</span>
        <select
          className={cx(controlClass(), 'h-7 min-w-36 max-w-60 truncate border-0 bg-transparent py-0 text-xs shadow-none')}
          value={mapVersionId}
          onChange={(e) => onMapVersionChange(e.target.value)}
          aria-label={t('Map version')}
          disabled={maps.length === 0}
        >
          {maps.length === 0 ? <option value="">{t('No map versions')}</option> : null}
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} · {m.status}
              {activeMapId === m.id ? t(' · Active') : ''}
              {` · v${m.versionNo}`}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

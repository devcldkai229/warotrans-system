import { cx } from '@/shared/lib/cx'
import type { MapVersionDto } from '@/shared/api/navigation'
import { controlClass } from '@/shared/ui/controlClass'

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
      className={cx(
        'absolute top-3 left-3 z-5 flex flex-wrap items-center gap-2 rounded-full bg-surface/95 py-1.5 pr-2 pl-3 text-xs text-ink-2 shadow-float',
        className,
      )}
    >
      {showWarehouse ? (
        <label className="flex items-center gap-1.5">
          <span className="text-muted">WH</span>
          <select
            className={cx(controlClass(), 'h-7 min-w-28 border-0 bg-transparent py-0 text-xs shadow-none')}
            value={warehouseId}
            onChange={(e) => onWarehouseChange(e.target.value)}
            aria-label="Warehouse"
          >
            {warehouses.length === 0 ? <option value="">No warehouse</option> : null}
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex items-center gap-1.5">
        <span className="text-muted">Map</span>
        <select
          className={cx(controlClass(), 'h-7 min-w-40 border-0 bg-transparent py-0 text-xs shadow-none')}
          value={mapVersionId}
          onChange={(e) => onMapVersionChange(e.target.value)}
          aria-label="Map version"
          disabled={maps.length === 0}
        >
          {maps.length === 0 ? <option value="">No map versions</option> : null}
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} · {m.status}
              {activeMapId === m.id ? ' · Active' : ''}
              {` · v${m.versionNo}`}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

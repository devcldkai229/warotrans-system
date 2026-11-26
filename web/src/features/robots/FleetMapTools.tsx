import { useEffect, useMemo, useRef, useState } from 'react'
import type { Edge, Endpoint, Zone } from '@/shared/api/contracts'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { humanize } from '@/shared/lib/format'
import { MapGlyph } from '@/shared/map/MapGlyph'
import {
  EDGE_COLOR,
  LANE_BAND_OPACITY,
  ROBOT_COLOR,
  ZONE_LABEL,
  ZONE_ORDER,
  zoneSwatchStyle,
} from '@/shared/map/mapStyle'
import {
  endpointVisualKind,
  endpointVisualKindLabel,
  visualKindColor,
  type EndpointVisualKind,
} from '@/shared/map/ottoArchitecture'
import type { MapRobot } from '@/shared/map/WarehouseMap'
import { Icon } from '@/shared/ui/Icon'
import type { useCostmapOverlay } from './useCostmapOverlay'

type ActiveToolPanel = 'layers' | 'guide' | null

interface FleetMapToolsProps {
  costmap: ReturnType<typeof useCostmapOverlay>
  robots: readonly MapRobot[]
  zones: readonly Zone[]
  edges: readonly Edge[]
  endpoints: readonly Endpoint[]
}

const POPOVER_SURFACE =
  'w-64 rounded-xl border border-[var(--otto-hud-border)] bg-[var(--otto-hud-bg)] p-3 text-xs text-ink shadow-float backdrop-blur-md'

const COST_LEGEND: readonly { swatch: string; label: string }[] = [
  { swatch: 'bg-[#ff00ff]', label: 'lethal (wall / keep-out)' },
  { swatch: 'bg-[#00ffff]', label: 'inscribed: robot centre may not enter' },
]

function LayerToggleRow({
  label,
  title,
  checked,
  onChange,
}: {
  label: string
  title?: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      className="flex h-8 w-full items-center justify-between rounded-lg px-2 text-left text-ink-soft transition-colors hover:bg-container-high/70"
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={cx(
          'relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full p-0.5 transition-colors duration-200',
          checked ? 'bg-green' : 'bg-container-highest',
        )}
      >
        <span
          className={cx(
            'size-3.5 rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-3.5' : 'translate-x-0',
          )}
        />
      </span>
    </button>
  )
}

/** Compact top-right OTTO tool cluster (`Layers & Costmap` + `Guide`) that stays collapsed by default. */
export function FleetMapTools({ costmap, robots, zones, edges, endpoints }: FleetMapToolsProps) {
  const { view, update } = costmap
  const [activePanel, setActivePanel] = useState<ActiveToolPanel>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!activePanel) return
    const handlePointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setActivePanel(null)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActivePanel(null)
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [activePanel])

  const hasCustomFilter = view.costmapRobot !== null || !view.zones || !view.lanes || !view.traffic

  const present = useMemo(() => {
    const robotStatuses = Array.from(new Set(robots.map((r) => r.status)))
    const zoneTypes = ZONE_ORDER.filter((type) => zones.some((z) => z.zoneType === type))
    const edgeDirs = Array.from(new Set(edges.map((e) => e.direction)))
    const stationKinds: EndpointVisualKind[] = Array.from(
      new Set(endpoints.map((ep) => endpointVisualKind(ep))),
    )
    return { robotStatuses, zoneTypes, edgeDirs, stationKinds }
  }, [robots, zones, edges, endpoints])

  const sourceOption = (value: string | null, label: string, title?: string) => {
    const selected = view.costmapRobot === value
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        title={title}
        onClick={() => update({ costmapRobot: value })}
        className={cx(
          'flex h-7 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors',
          selected ? 'bg-container-high font-medium text-ink' : 'text-ink-2 hover:bg-container-high/60 hover:text-ink',
        )}
      >
        <span
          className={cx(
            'size-2 shrink-0 rounded-full border',
            selected ? 'border-transparent bg-primary' : 'border-muted/60 bg-transparent',
          )}
        />
        <span className="truncate">{label}</span>
      </button>
    )
  }

  return (
    <div
      ref={rootRef}
      data-map-ui
      className="pointer-events-auto absolute top-3 right-3 z-5 flex flex-col items-end gap-2"
    >
      <div className="flex h-9 items-center gap-0.5 rounded-full border border-[var(--otto-hud-border)] bg-[var(--otto-hud-bg)] p-1 shadow-float backdrop-blur-md">
        <button
          type="button"
          aria-label={t('Layers & Costmap')}
          aria-expanded={activePanel === 'layers'}
          title={t('Layers & Costmap')}
          onClick={() => setActivePanel((prev) => (prev === 'layers' ? null : 'layers'))}
          className={cx(
            'relative grid size-7 place-items-center rounded-full transition-colors',
            activePanel === 'layers'
              ? 'bg-ink text-surface'
              : 'text-ink-2 hover:bg-container-high/70 hover:text-ink',
          )}
        >
          <Icon name="layers" size={15} />
          {hasCustomFilter ? (
            <span
              className={cx(
                'absolute top-1 right-1 size-1.5 rounded-full',
                activePanel === 'layers' ? 'bg-surface' : 'bg-primary',
              )}
              aria-hidden="true"
            />
          ) : null}
        </button>
        <span className="h-4 w-px bg-outline-soft" aria-hidden="true" />
        <button
          type="button"
          aria-label={t('Guide')}
          aria-expanded={activePanel === 'guide'}
          title={t('Guide')}
          onClick={() => setActivePanel((prev) => (prev === 'guide' ? null : 'guide'))}
          className={cx(
            'grid size-7 place-items-center rounded-full transition-colors',
            activePanel === 'guide'
              ? 'bg-ink text-surface'
              : 'text-ink-2 hover:bg-container-high/70 hover:text-ink',
          )}
        >
          <Icon name="info" size={15} />
        </button>
      </div>

      {activePanel === 'layers' ? (
        <div className={POPOVER_SURFACE} role="dialog" aria-label={t('Layers & Costmap')}>
          <section>
            <div className="mb-1 px-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
              {t('Show')}
            </div>
            <div className="flex flex-col gap-0.5">
              <LayerToggleRow label={t('Zones')} checked={view.zones} onChange={(v) => update({ zones: v })} />
              <LayerToggleRow label={t('Lanes')} checked={view.lanes} onChange={(v) => update({ lanes: v })} />
              <LayerToggleRow label={t('Traffic')} checked={view.traffic} onChange={(v) => update({ traffic: v })} />
              <LayerToggleRow label={t('Floor tiles (35 cm)')} checked={view.floorGrid} onChange={(v) => update({ floorGrid: v })} />
            </div>
            <p className="mt-1 px-2 text-[11px] text-muted">{t('Endpoints always shown')}</p>
          </section>

          <section className="mt-2.5 border-t border-outline-soft pt-2.5" role="radiogroup" aria-label={t('Costmap')}>
            <div className="mb-1 px-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
              {t('Costmap')}
            </div>
            <div className="flex flex-col gap-0.5">
              {sourceOption(null, t('Off'))}
              {sourceOption(
                'MAP',
                t('Map'),
                t("The map's own costmap: walls + inflation, as Nav2 plans right after mapping (no robot, no traffic)"),
              )}
              {view.costmapRobot === 'MAP' ? (
                <div className="pl-3">
                  <LayerToggleRow
                    label={t('Keep-out')}
                    title={t('Add the planner keep-out mask (lethal)')}
                    checked={view.keepout}
                    onChange={(v) => update({ keepout: v })}
                  />
                </div>
              ) : null}

              {costmap.robotCodes.length > 0 ? (
                <div className="mt-1.5 px-2 text-[11px] text-muted">{t('Live from robot')}</div>
              ) : null}
              {costmap.robotCodes.map((code) => (
                <div key={code}>
                  {sourceOption(code, code, t("This robot's own Nav2 global costmap: what its planner plans on"))}
                </div>
              ))}
              {view.costmapRobot && view.costmapRobot !== 'MAP' ? (
                <div className="pl-3">
                  <LayerToggleRow
                    label={t('Local')}
                    title={t('The local costmap around the robot: obstacles its LiDAR sees now')}
                    checked={view.local}
                    onChange={(v) => update({ local: v })}
                  />
                </div>
              ) : null}
            </div>

            {view.costmapRobot ? (
              <div className="mt-2.5 flex flex-col gap-1 border-t border-outline-soft px-2 pt-2 text-[11px] text-muted">
                {COST_LEGEND.map((item) => (
                  <span key={item.label} className="flex items-center gap-1.5">
                    <span className={cx('inline-block h-2 w-3 shrink-0 rounded-xs opacity-75', item.swatch)} />
                    <span>{t(item.label)}</span>
                  </span>
                ))}
                {costmap.staticInfo ? (
                  <span>
                    {t('{source}; inscribed {ins} m, inflation {inf} m', {
                      source: costmap.staticInfo.source,
                      ins: costmap.staticInfo.inscribedRadius,
                      inf: costmap.staticInfo.inflationRadius,
                    })}
                  </span>
                ) : null}
                {costmap.staticError ? (
                  <span className="text-red-ink">{t('No semantic bundle on this Host')}</span>
                ) : null}
                {costmap.noCostmap ? (
                  <span className="text-amber-ink">
                    {t('{code} sends no costmap (offline or old gateway)', { code: view.costmapRobot })}
                  </span>
                ) : costmap.receivedAt ? (
                  <span>{t('received {time}', { time: new Date(costmap.receivedAt).toLocaleTimeString() })}</span>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {activePanel === 'guide' ? (
        <div
          className={cx(POPOVER_SURFACE, 'max-h-[65vh] overflow-y-auto')}
          role="dialog"
          aria-label={t('Guide')}
        >
          <div className="mb-2 text-xs font-semibold text-ink">{t('Guide')}</div>

          {present.robotStatuses.length > 0 ? (
            <section className="mt-2">
              <h5 className="mb-1 text-[11px] font-medium text-muted">{t('Robots')}</h5>
              <ul className="flex flex-col gap-1">
                {present.robotStatuses.map((status) => (
                  <li key={status} className="flex items-center gap-2 text-ink-2">
                    <span
                      className="inline-flex h-4 w-5 shrink-0 items-center justify-center rounded-sm border border-[var(--otto-chassis-stroke)] bg-[var(--otto-chassis-fill)]"
                      aria-hidden="true"
                    >
                      <span
                        className="h-1 w-3.5 rounded-full"
                        style={{ backgroundColor: ROBOT_COLOR[status] }}
                      />
                    </span>
                    <span>{humanize(status)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {view.zones && present.zoneTypes.length > 0 ? (
            <section className="mt-3">
              <h5 className="mb-1 text-[11px] font-medium text-muted">{t('Zones')}</h5>
              <ul className="flex flex-col gap-1">
                {present.zoneTypes.map((type) => (
                  <li key={type} className="flex items-center gap-2 text-ink-2">
                    <i className="size-2.5 shrink-0 rounded-xs border-[1.5px]" style={zoneSwatchStyle(type)} />
                    <span>{ZONE_LABEL[type]}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {view.lanes && present.edgeDirs.length > 0 ? (
            <section className="mt-3">
              <h5 className="mb-1 text-[11px] font-medium text-muted">{t('Paths')}</h5>
              <ul className="flex flex-col gap-1">
                {present.edgeDirs.map((direction) => (
                  <li key={direction} className="flex items-center gap-2 text-ink-2">
                    <svg className="shrink-0" width="22" height="12" viewBox="0 0 22 12" color={EDGE_COLOR[direction]}>
                      <rect x={0} y={0} width={22} height={12} fill="currentColor" fillOpacity={LANE_BAND_OPACITY * 1.5} />
                      {direction === 'ONE_WAY' ? (
                        <path
                          d="M8 2 L13 6 L8 10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : (
                        <>
                          <line x1={0} y1={6} x2={22} y2={6} stroke="currentColor" strokeWidth={0.8} strokeDasharray="2 1.5" />
                          <path d="M13 1.2 L10 3.2 L13 5" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M9 7 L12 8.8 L9 10.8" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
                        </>
                      )}
                    </svg>
                    <span>{direction === 'ONE_WAY' ? t('One-way edge') : t('Two-way edge')}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {present.stationKinds.length > 0 ? (
            <section className="mt-3">
              <h5 className="mb-1 text-[11px] font-medium text-muted">{t('Endpoints')}</h5>
              <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
                {present.stationKinds.map((kind) => (
                  <li key={kind} className="flex items-center gap-1.5 text-ink-2">
                    <svg className="shrink-0" width="18" height="18" viewBox="-1 -1 2 2" color={visualKindColor(kind)}>
                      <rect
                        x={-0.85}
                        y={-0.85}
                        width={1.7}
                        height={1.7}
                        rx={0.42}
                        fill="var(--color-surface)"
                        stroke="currentColor"
                        strokeWidth={0.16}
                      />
                      <MapGlyph icon={kind} size={1.05} />
                    </svg>
                    <span className="truncate">{endpointVisualKindLabel(kind)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-muted">{t('The wedge shows the arrival heading.')}</p>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

import { t } from '@/shared/i18n'
import type { useCostmapOverlay } from './useCostmapOverlay'

const CHIP = 'flex h-7 items-center gap-1.5 rounded-full px-2.5 transition-colors duration-200'
const ON = 'bg-primary-soft text-primary-ink'
const OFF = 'text-ink-2 hover:bg-container-high'

/** RViz costmap legend: what each colour means. */
const LEGEND: { swatch: string; label: string }[] = [
  { swatch: 'bg-[#ff00ff]', label: 'lethal (wall / keep-out)' },
  { swatch: 'bg-[#00ffff]', label: 'inscribed: robot centre may not enter' },
]

/** Fleet map view: which robot's live Nav2 costmap to draw, and which traffic layers to keep. */
export function CostmapToggles({ costmap }: { costmap: ReturnType<typeof useCostmapOverlay> }) {
  const { view, update } = costmap
  return (
    <div className="absolute top-3 left-3 z-5 flex max-w-[min(560px,calc(100%-1.5rem))] flex-col gap-1.5 rounded-2xl bg-surface/95 px-2.5 py-2 text-xs shadow-float">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="px-1 font-medium text-ink-2">{t('Costmap')}</span>
        <button type="button" aria-pressed={view.costmapRobot == null} onClick={() => update({ costmapRobot: null })}
          className={`${CHIP} ${view.costmapRobot == null ? ON : OFF}`}>
          {t('Off')}
        </button>
        <button type="button" aria-pressed={view.costmapRobot === 'MAP'} onClick={() => update({ costmapRobot: 'MAP' })}
          title={t("The map's own costmap: walls + inflation, as Nav2 plans right after mapping (no robot, no traffic)")}
          className={`${CHIP} ${view.costmapRobot === 'MAP' ? ON : OFF}`}>
          {t('Map')}
        </button>
        {view.costmapRobot === 'MAP' ? (
          <label className={`${CHIP} cursor-pointer ${view.keepout ? ON : OFF}`} title={t('Add the planner keep-out mask (lethal)')}>
            <input type="checkbox" className="size-3" checked={view.keepout} onChange={(e) => update({ keepout: e.target.checked })} />
            {t('Keep-out')}
          </label>
        ) : null}
        <span className="px-1 text-muted">{t('Live from robot')}</span>
        {costmap.robotCodes.map((code) => (
          <button key={code} type="button" aria-pressed={view.costmapRobot === code} onClick={() => update({ costmapRobot: code })}
            title={t("This robot's own Nav2 global costmap: what its planner plans on")}
            className={`${CHIP} ${view.costmapRobot === code ? ON : OFF}`}>
            {code}
          </button>
        ))}
        <label className={`${CHIP} cursor-pointer ${view.local ? ON : OFF} ${view.costmapRobot == null || view.costmapRobot === 'MAP' ? 'pointer-events-none opacity-40' : ''}`}
          title={t('The local costmap around the robot: obstacles its LiDAR sees now')}>
          <input type="checkbox" className="size-3" checked={view.local} onChange={(e) => update({ local: e.target.checked })} />
          {t('Local')}
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="px-1 font-medium text-ink-2">{t('Show')}</span>
        {(['zones', 'lanes', 'traffic'] as const).map((key) => (
          <label key={key} className={`${CHIP} cursor-pointer ${view[key] ? ON : OFF}`}>
            <input type="checkbox" className="size-3" checked={view[key]} onChange={(e) => update({ [key]: e.target.checked })} />
            {t(key === 'zones' ? 'Zones' : key === 'lanes' ? 'Lanes' : 'Traffic')}
          </label>
        ))}
        <span className="px-1 text-muted">{t('Endpoints always shown')}</span>
      </div>
      {view.costmapRobot ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-muted">
          {LEGEND.map((l) => (
            <span key={l.label} className="flex items-center gap-1">
              <span className={`inline-block h-2 w-3 rounded-sm opacity-70 ${l.swatch}`} />
              {t(l.label)}
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
          {costmap.staticError ? <span className="text-red">{t('No semantic bundle on this Host')}</span> : null}
          {costmap.noCostmap ? (
            <span className="text-amber-ink">{t('{code} sends no costmap (offline or old gateway)', { code: view.costmapRobot })}</span>
          ) : costmap.receivedAt ? (
            <span>{t('received {time}', { time: new Date(costmap.receivedAt).toLocaleTimeString() })}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

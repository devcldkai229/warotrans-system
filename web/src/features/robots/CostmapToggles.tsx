import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { t } from '@/shared/i18n'
import type { useCostmapOverlay } from './useCostmapOverlay'

const ROW = 'flex h-7 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors duration-200'
const ON = 'bg-primary-soft text-primary-ink'
const OFF = 'text-ink-2 hover:bg-container-high'

const POS_KEY = 'warotrans.fleetMap.costmapBox'
const DEFAULT_POS = { right: 12, top: 56 }

/** Costmap legend: only what blocks a robot is drawn. */
const LEGEND: { swatch: string; label: string }[] = [
  { swatch: 'bg-[#ff00ff]', label: 'lethal (wall / keep-out)' },
  { swatch: 'bg-[#00ffff]', label: 'inscribed: robot centre may not enter' },
]

/** Fleet map view box (right side, below the map chip): costmap source and which traffic layers stay visible. */
export function CostmapToggles({ costmap }: { costmap: ReturnType<typeof useCostmapOverlay> }) {
  const { view, update } = costmap
  const [open, setOpen] = useState(true)
  // Draggable: offset from the map's top-right corner, kept inside the map frame and remembered per viewer.
  const [pos, setPos] = useState<{ right: number; top: number }>(() => {
    try {
      const raw = window.localStorage.getItem(POS_KEY)
      return raw ? (JSON.parse(raw) as { right: number; top: number }) : DEFAULT_POS
    } catch {
      return DEFAULT_POS
    }
  })
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; right: number; top: number } | null>(null)
  const onGripDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, right: pos.right, top: pos.top }
  }
  const onGripMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const d = drag.current
    const el = box.current
    if (!d || !el) return
    const frame = el.parentElement?.getBoundingClientRect()
    const maxRight = frame ? Math.max(0, frame.width - el.offsetWidth) : Infinity
    const maxTop = frame ? Math.max(0, frame.height - 40) : Infinity
    setPos({
      right: Math.min(maxRight, Math.max(0, d.right - (e.clientX - d.x))),
      top: Math.min(maxTop, Math.max(0, d.top + (e.clientY - d.y))),
    })
  }
  const onGripUp = () => {
    drag.current = null
    try {
      window.localStorage.setItem(POS_KEY, JSON.stringify(pos))
    } catch {
      // per-viewer convenience only
    }
  }
  const source = (value: string | null, label: string, title?: string) => (
    <button type="button" aria-pressed={view.costmapRobot === value} title={title} onClick={() => update({ costmapRobot: value })}
      className={`${ROW} ${view.costmapRobot === value ? ON : OFF}`}>
      <span className={`size-2 rounded-full ${view.costmapRobot === value ? 'bg-primary' : 'bg-outline'}`} />
      {label}
    </button>
  )
  const check = (checked: boolean, onChange: (v: boolean) => void, label: string, title?: string) => (
    <label title={title} className={`${ROW} cursor-pointer ${checked ? ON : OFF}`}>
      <input type="checkbox" className="size-3" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )

  return (
    <div ref={box} className="absolute z-5 w-56 rounded-2xl bg-surface/95 p-2 text-xs shadow-float"
      style={{ right: pos.right, top: pos.top }}>
      <div className="flex items-center gap-1">
        <span role="separator" aria-label={t('Drag to move')} title={t('Drag to move')}
          className="cursor-grab touch-none select-none px-1 text-muted active:cursor-grabbing"
          onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripUp}>
          ⠿
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="flex flex-1 items-center justify-between py-1 pr-2 font-medium text-ink">
          {t('Costmap')}
          <span className="text-muted">{open ? '−' : '+'}</span>
        </button>
      </div>
      {open ? (
        <div className="mt-1 flex flex-col gap-0.5">
          {source(null, t('Off'))}
          {source('MAP', t('Map'), t("The map's own costmap: walls + inflation, as Nav2 plans right after mapping (no robot, no traffic)"))}
          {view.costmapRobot === 'MAP' ? (
            <div className="pl-4">{check(view.keepout, (v) => update({ keepout: v }), t('Keep-out'), t('Add the planner keep-out mask (lethal)'))}</div>
          ) : null}
          <div className="mt-1 px-2 text-muted">{t('Live from robot')}</div>
          {costmap.robotCodes.map((code) => (
            <div key={code}>{source(code, code, t("This robot's own Nav2 global costmap: what its planner plans on"))}</div>
          ))}
          {view.costmapRobot && view.costmapRobot !== 'MAP' ? (
            <div className="pl-4">
              {check(view.local, (v) => update({ local: v }), t('Local'), t('The local costmap around the robot: obstacles its LiDAR sees now'))}
            </div>
          ) : null}

          <div className="mt-2 border-t border-outline/40 px-2 pt-2 text-muted">{t('Show')}</div>
          {check(view.zones, (v) => update({ zones: v }), t('Zones'))}
          {check(view.lanes, (v) => update({ lanes: v }), t('Lanes'))}
          {check(view.traffic, (v) => update({ traffic: v }), t('Traffic'))}
          <div className="px-2 text-muted">{t('Endpoints always shown')}</div>

          {view.costmapRobot ? (
            <div className="mt-2 flex flex-col gap-1 border-t border-outline/40 px-2 pt-2 text-muted">
              {LEGEND.map((l) => (
                <span key={l.label} className="flex items-center gap-1.5">
                  <span className={`inline-block h-2 w-3 shrink-0 rounded-sm opacity-70 ${l.swatch}`} />
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
      ) : null}
    </div>
  )
}

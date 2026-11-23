import { t } from '@/shared/i18n'
import type { CostmapLayerKey, useCostmapOverlay } from './useCostmapOverlay'

const LAYERS: { key: CostmapLayerKey; label: string; swatch: string; hint: string }[] = [
  { key: 'keepout', label: 'Keep-out', swatch: 'bg-[#e53935]', hint: 'Costmap keep-out mask the robots plan with' },
  { key: 'speed', label: 'Speed limits', swatch: 'bg-[#f7b928]', hint: 'Costmap speed mask (darker = slower)' },
  { key: 'cells', label: 'Traffic cells', swatch: 'bg-[#2d88ff]', hint: 'Cells each robot holds (solid) or was granted (outline)' },
]

/** On/off chips for the costmap overlays of the Fleet map (admin). */
export function CostmapToggles({ costmap }: { costmap: ReturnType<typeof useCostmapOverlay> }) {
  return (
    <div className="absolute top-3 left-3 z-5 flex flex-wrap items-center gap-1.5 rounded-2xl bg-surface/95 px-2 py-1.5 text-xs shadow-float">
      <span className="px-1 font-medium text-ink-2">{t('Costmap')}</span>
      {LAYERS.map((layer) => {
        const on = costmap.shown[layer.key]
        const missing = layer.key !== 'cells' && on && !costmap.available[layer.key as 'keepout' | 'speed']
        return (
          <button
            key={layer.key}
            type="button"
            aria-pressed={on}
            title={t(layer.hint)}
            onClick={() => costmap.toggle(layer.key)}
            className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 transition-colors duration-200 ${
              on ? 'bg-primary-soft text-primary-ink' : 'text-ink-2 hover:bg-container-high'
            }`}
          >
            <span className={`size-2 rounded-sm ${layer.swatch} ${on ? '' : 'opacity-40'}`} />
            {t(layer.label)}
            {missing ? <span className="text-muted">({t('empty')})</span> : null}
          </button>
        )
      })}
      {costmap.error ? <span className="px-1 text-red">{t('No semantic bundle on this Host')}</span> : null}
    </div>
  )
}

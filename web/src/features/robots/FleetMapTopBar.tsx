import type { MapVersionDto } from '@/shared/api/navigation'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { humanize } from '@/shared/lib/format'

export interface FleetMapTopBarProps {
  mapVersion: MapVersionDto | null
  trafficLive: boolean
  trafficEpoch?: number | null
}

function displayMapCode(mapVersion: MapVersionDto): string {
  const versionPattern = new RegExp(`-V0*${mapVersion.versionNo}$`, 'i')
  const stripped = mapVersion.code.replace(versionPattern, '')
  return stripped || mapVersion.code
}

/** Single-row frosted status pill showing live connection, active map version, and traffic epoch. */
export function FleetMapTopBar({ mapVersion, trafficLive, trafficEpoch }: FleetMapTopBarProps) {
  return (
    <div
      data-map-ui
      className="pointer-events-auto absolute top-3 left-3 z-5 flex h-9 max-w-[calc(100%-108px)] items-center gap-2 overflow-hidden rounded-full border border-[var(--otto-hud-border)] bg-[var(--otto-hud-bg)] px-3 text-xs text-ink shadow-float backdrop-blur-md"
    >
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
        <span
          className={cx('size-2 rounded-full', trafficLive ? 'bg-green' : 'bg-amber')}
          aria-hidden="true"
        />
        <span className="text-[11px] font-medium text-ink-2">
          {trafficLive ? t('Live') : t('Polling')}
        </span>
      </span>

      <span className="h-3.5 w-px shrink-0 bg-outline-soft" aria-hidden="true" />

      {mapVersion ? (
        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
          <span className="truncate font-semibold tracking-tight text-ink">
            {displayMapCode(mapVersion)}
          </span>
          <span className="shrink-0 rounded-full bg-container-high/80 px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink-2 tabular-nums">
            v{mapVersion.versionNo}
          </span>
          {mapVersion.status !== 'PUBLISHED' ? (
            <span className="shrink-0 text-[11px] text-amber-ink">
              {humanize(String(mapVersion.status))}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="truncate text-muted">{t('No map selected')}</span>
      )}

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

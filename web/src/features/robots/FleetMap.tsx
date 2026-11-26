import { useMemo, useState } from 'react'
import type { Edge, Endpoint, RobotView, Zone } from '@/shared/api/contracts'
import type { MapVersionDto } from '@/shared/api/navigation'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import type { MapBounds } from '@/shared/lib/mapView'
import { formatTrafficAlertReason } from '@/shared/map/ottoArchitecture'
import { findEndpointByName } from '@/shared/map/scene'
import { WarehouseMap, type MapMovement, type MapRobot } from '@/shared/map/WarehouseMap'
import { FleetMapTopBar } from './FleetMapTopBar'
import { FleetMapTools } from './FleetMapTools'

/** The warehouse floor tiles (12 x 10 tiles of 35 cm on MAP-ONE). */
const FLOOR_TILE_METERS = 0.35
import { isMapAlignDebugEnabled, MapAlignDebugOverlay } from './MapAlignDebugOverlay'
import { RobotPreviewCard } from './RobotPreviewCard'
import { shownRobotStatus } from './robotStatus'
import { useCostmapOverlay } from './useCostmapOverlay'
import { summarizeTrafficWait, useTrafficOverlay } from './useTrafficOverlay'

interface FleetMapProps {
  robots: RobotView[]
  selectedCode: string | null
  onSelect: (code: string) => void
  /** `detail` is the map shown beside the Robot Detail panel: it follows that one Robot. */
  variant?: 'overview' | 'detail'
  /** Overview only: the robot whose summary card is open. A marker click previews; "View details" calls `onSelect`. */
  previewCode?: string | null
  onPreview?: (code: string | null) => void
  endpoints?: Endpoint[]
  edges?: Edge[]
  zones?: Zone[]
  bounds?: MapBounds
  occupancyImageUrl?: string | null
  /** Poll SegmentedTrafficCoordinator snapshot (Admin). Default on for overview. */
  enableTrafficOverlay?: boolean
  /** Active MapVersion meta for VITE_MAP_ALIGN_DEBUG overlay (origin/resolution). */
  mapVersion?: MapVersionDto | null
  /** Overview: the warehouse's map versions and the map picker of the top bar. */
  maps?: MapVersionDto[]
  onSelectMap?: (mapVersionId: string) => void
}

interface FleetTrafficAlert {
  robotCode: string
  tone: 'danger' | 'warn'
  title: string
  detail: string
}

/** "Rack A-12 → Dock 3" → the two Endpoints it names, when both exist on the map. */
function endpointsOfRoute(routeLabel: string | undefined, endpoints: Endpoint[]) {
  const [from, to] = (routeLabel ?? '').split('→').map((part) => findEndpointByName(part, endpoints))
  return from && to ? { from, to } : null
}

/** The fleet on the shared map: OTTO floor plan architecture, unified HUD, live robots, and traffic strip. */
export function FleetMap({
  robots,
  selectedCode,
  onSelect,
  variant = 'overview',
  previewCode = null,
  onPreview,
  endpoints = [],
  edges = [],
  zones = [],
  bounds,
  occupancyImageUrl = null,
  enableTrafficOverlay = true,
  mapVersion = null,
  maps,
  onSelectMap,
}: FleetMapProps) {
  const alignDebug = isMapAlignDebugEnabled()
  const { snap, overlay: trafficOverlay } = useTrafficOverlay(robots, enableTrafficOverlay)
  const costmap = useCostmapOverlay(snap, robots, enableTrafficOverlay)
  const [alertsExpanded, setAlertsExpanded] = useState(false)

  const mapRobots = useMemo<MapRobot[]>(
    () =>
      robots.map((robot) => ({
        code: robot.code,
        status: shownRobotStatus(robot),
        x: robot.poseX,
        y: robot.poseY,
        yaw: robot.poseYaw,
        alert: robot.status === 'ERROR' || (trafficOverlay?.quarantinedRobotCodes?.includes(robot.code) ?? false),
        lengthM: robot.lengthM ?? null,
        widthM: robot.widthM ?? null,
      })),
    [robots, trafficOverlay],
  )

  const routes = useMemo(
    () =>
      robots
        .filter((robot) => robot.activity)
        .map((robot) => ({ robot, route: endpointsOfRoute(robot.activity?.routeLabel, endpoints) }))
        .filter((item) => item.route !== null),
    [robots, endpoints],
  )

  const detail = variant === 'detail'
  const shown = detail ? routes.filter((item) => item.robot.code === selectedCode) : routes
  const focusEndpointIds = shown.flatMap((item) => [item.route!.from.id, item.route!.to.id])
  const movements: MapMovement[] = detail
    ? shown.map((item) => ({
        from: item.route!.from,
        to: item.route!.to,
        label: item.robot.activity?.requestCode,
      }))
    : []

  const trafficAlerts = useMemo<FleetTrafficAlert[]>(() => {
    const byCode = new Map<string, FleetTrafficAlert>()

    const upsert = (item: FleetTrafficAlert) => {
      const existing = byCode.get(item.robotCode)
      if (!existing || (existing.tone === 'warn' && item.tone === 'danger')) {
        byCode.set(item.robotCode, item)
      }
    }

    for (const r of snap?.robots ?? []) {
      if (!r.quarantineReason) continue
      const robot = robots.find((x) => x.id === r.robotId)
      if (!robot) continue
      upsert({
        robotCode: robot.code,
        tone: 'danger',
        title: t('{code} quarantined', { code: robot.code }),
        detail: formatTrafficAlertReason(r.quarantineReason, robots),
      })
    }

    for (const robot of robots) {
      const zone = robot.telemetry?.zone
      if (!zone?.heldByRobotCode) continue
      upsert({
        robotCode: robot.code,
        tone: 'danger',
        title: t('{code} waiting at {zone}', { code: robot.code, zone: zone.name }),
        detail: t('held by {heldByRobotCode}, queue +{value}', {
          heldByRobotCode: zone.heldByRobotCode,
          value: zone.queueAfter ?? 0,
        }),
      })
    }

    const waitRobotIds = Array.from(new Set((snap?.waits ?? []).map((wait) => wait.robotId)))
    for (const robotId of waitRobotIds) {
      const robot = robots.find((r) => r.id === robotId)
      const wait = robot && snap ? summarizeTrafficWait(robotId, snap, robots) : null
      if (!robot || !wait) continue
      const what = wait.resourceId.replace(/^zone:/, '')
      const more = wait.more > 0 ? ` (+${wait.more})` : ''
      upsert({
        robotCode: robot.code,
        tone: 'warn',
        title: wait.blockerCode
          ? t('{code} waiting for {blocker}', { code: robot.code, blocker: wait.blockerCode })
          : t('{code} traffic wait', { code: robot.code }),
        detail: `${formatTrafficAlertReason(wait.reason, robots)} @ ${what}${more}`,
      })
    }

    return Array.from(byCode.values())
  }, [snap, robots])

  const alertByRobotCode = useMemo(
    () => new Map(trafficAlerts.map((item) => [item.robotCode, item])),
    [trafficAlerts],
  )

  const previewed = robots.find((robot) => robot.code === previewCode) ?? null
  const primaryAlert = trafficAlerts[0] ?? null
  const visibleAlerts = alertsExpanded && trafficAlerts.length > 1 ? trafficAlerts : primaryAlert ? [primaryAlert] : []

  return (
    <>
      <WarehouseMap
        floorTileMeters={costmap.view.floorGrid ? FLOOR_TILE_METERS : null}
        yawUnit="rad"
        zones={zones}
        edges={edges}
        endpoints={endpoints}
        bounds={bounds}
        occupancyImageUrl={occupancyImageUrl}
        robots={mapRobots}
        layers={{
          occupancy: costmap.view.traffic,
          zones: costmap.view.zones,
          edges: costmap.view.lanes,
          legend: false,
        }}
        labels="all"
        focusEndpointIds={focusEndpointIds}
        focusRobotCodes={detail && selectedCode ? [selectedCode] : undefined}
        movements={movements}
        trafficOverlay={
          costmap.view.traffic
            ? trafficOverlay
            : trafficOverlay?.plannedPaths
              ? { plannedPaths: trafficOverlay.plannedPaths }
              : null
        }
        costmapImages={costmap.costmapImages}
        cellSets={costmap.cellSets}
        callouts={[]}
        selected={{ robotCode: detail ? (selectedCode ?? undefined) : (previewCode ?? undefined) }}
        onRobotClick={(code) => (detail ? onSelect(code) : onPreview?.(previewCode === code ? null : code))}
        onBackgroundClick={() => onPreview?.(null)}
        renderOverlay={(effectiveBounds) =>
          !detail && previewed ? (
            <RobotPreviewCard
              robot={previewed}
              bounds={effectiveBounds}
              alertMessage={alertByRobotCode.get(previewed.code)?.detail ?? null}
              onClose={() => onPreview?.(null)}
              onOpenDetails={() => onSelect(previewed.code)}
            />
          ) : null
        }
      />

      <FleetMapTopBar
        mapVersion={mapVersion}
        trafficLive={Boolean(snap)}
        trafficEpoch={snap?.epoch ?? null}
        maps={maps}
        onSelectMap={onSelectMap}
      />

      {enableTrafficOverlay ? (
        <FleetMapTools
          costmap={costmap}
          robots={mapRobots}
          zones={zones}
          edges={edges}
          endpoints={endpoints}
        />
      ) : null}

      {visibleAlerts.length > 0 ? (
        <div
          data-map-ui
          className="pointer-events-auto absolute bottom-3 left-1/2 z-5 flex w-max max-w-[min(460px,calc(100%-220px))] -translate-x-1/2 flex-col gap-1.5"
        >
          {visibleAlerts.map((alert, idx) => (
            <div
              key={alert.robotCode}
              className="flex items-center gap-2 rounded-full border border-[var(--otto-hud-border)] bg-[var(--otto-hud-bg)] py-1.5 pr-2 pl-3 text-xs text-ink shadow-float backdrop-blur-md"
            >
              <button
                type="button"
                onClick={() => (detail ? onSelect(alert.robotCode) : onPreview?.(alert.robotCode))}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span
                  className={cx('size-2 shrink-0 rounded-full', alert.tone === 'danger' ? 'bg-red' : 'bg-amber')}
                  aria-hidden="true"
                />
                <span className="shrink-0 font-medium text-ink">{alert.title}</span>
                <span className="text-muted/70" aria-hidden="true">
                  ·
                </span>
                <span className="min-w-0 truncate text-ink-2">{alert.detail}</span>
              </button>
              {idx === visibleAlerts.length - 1 && trafficAlerts.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setAlertsExpanded((v) => !v)}
                  aria-expanded={alertsExpanded}
                  className="shrink-0 rounded-full bg-container-high px-2 py-0.5 text-[11px] font-medium text-ink-2 tabular-nums transition-colors hover:text-ink"
                >
                  {alertsExpanded ? t('Hide') : `+${trafficAlerts.length - 1}`}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {alignDebug ? (
        <MapAlignDebugOverlay
          robots={robots}
          endpoints={endpoints}
          mapVersion={mapVersion}
          trafficEpoch={snap?.epoch}
        />
      ) : null}
    </>
  )
}

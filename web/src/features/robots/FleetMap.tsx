import { useMemo } from 'react'
import type { RobotView } from '@/shared/api/contracts'
import { WarehouseMap, type MapCallout, type MapMovement, type MapRobot } from '@/shared/map/WarehouseMap'
import { findEndpointByName } from '@/shared/map/scene'
import { LIVE_MAP_LABEL } from './mock'
import { RobotPreviewCard } from './RobotPreviewCard'

interface FleetMapProps {
  robots: RobotView[]
  selectedCode: string | null
  onSelect: (code: string) => void
  /** `detail` is the full-bleed map shown behind the Robot Detail panel. */
  variant?: 'overview' | 'detail'
  /** Overview only: the robot whose summary card is open. A marker click previews; "View details" calls `onSelect`. */
  previewCode?: string | null
  onPreview?: (code: string | null) => void
}

/** "Rack A-12 → Dock 3" → the two Endpoints it names, when both exist on the map. */
function endpointsOfRoute(routeLabel: string | undefined) {
  const [from, to] = (routeLabel ?? '').split('→').map((part) => findEndpointByName(part))
  return from && to ? { from, to } : null
}

/** The fleet on the shared map: Robots by status, Zone/Edge occupancy, and where each active job is heading. */
export function FleetMap({ robots, selectedCode, onSelect, variant = 'overview', previewCode = null, onPreview }: FleetMapProps) {
  const mapRobots = useMemo<MapRobot[]>(
    () =>
      robots.map((robot) => ({
        code: robot.code,
        status: robot.status,
        x: robot.poseX,
        y: robot.poseY,
        yaw: robot.poseYaw,
        alert: robot.status === 'ERROR',
      })),
    [robots],
  )

  const routes = useMemo(
    () =>
      robots
        .filter((robot) => robot.activity)
        .map((robot) => ({ robot, route: endpointsOfRoute(robot.activity?.routeLabel) }))
        .filter((item) => item.route !== null),
    [robots],
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

  // A Robot stopped in a Zone another Robot holds: say who holds it and who is queued (TrafficCoordinator, rules/05).
  const callouts: MapCallout[] = robots.flatMap((robot) => {
    const zone = robot.telemetry?.zone
    if (!zone?.heldByRobotCode) return []
    return [
      {
        x: robot.poseX,
        y: robot.poseY,
        tone: 'danger' as const,
        lines: [`${robot.code} waiting at ${zone.name}`, `held by ${zone.heldByRobotCode} · queue +${zone.queueAfter ?? 0}`],
      },
    ]
  })

  const previewed = robots.find((robot) => robot.code === previewCode) ?? null

  return (
    <>
      <WarehouseMap
        robots={mapRobots}
        layers={{ occupancy: true, legendOpen: true }}
        labels="focus"
        focusEndpointIds={focusEndpointIds}
        focusRobotCodes={detail && selectedCode ? [selectedCode] : undefined}
        movements={movements}
        callouts={callouts}
        selected={{ robotCode: detail ? (selectedCode ?? undefined) : (previewCode ?? undefined) }}
        onRobotClick={(code) => (detail ? onSelect(code) : onPreview?.(previewCode === code ? null : code))}
        onBackgroundClick={() => onPreview?.(null)}
      >
        {!detail && previewed ? (
          <RobotPreviewCard robot={previewed} onClose={() => onPreview?.(null)} onOpenDetails={() => onSelect(previewed.code)} />
        ) : null}
      </WarehouseMap>
      <div className="fleet__live">
        <span className="dot" />
        {LIVE_MAP_LABEL}
      </div>
    </>
  )
}

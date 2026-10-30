import { useMemo } from 'react'
import type { Endpoint, RobotView } from '@/shared/api/contracts'
import type { MapVersionDto } from '@/shared/api/navigation'
import { worldToPixel } from '@/shared/map/mapCoordinateTransform'

const STALE_MS = 15_000

export interface MapAlignDebugOverlayProps {
  robots: RobotView[]
  endpoints: Endpoint[]
  mapVersion: MapVersionDto | null
  trafficEpoch?: number
}

function parkEndpoints(endpoints: Endpoint[]) {
  return endpoints.filter((e) => e.code?.startsWith('EP-PARK') || e.endpointType === 'PARK')
}

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by)
}

/** Dev-only Fleet Map panel: PARK vs backend telemetry using worldToPixel (no fudge offsets). */
export function MapAlignDebugOverlay({ robots, endpoints, mapVersion, trafficEpoch }: MapAlignDebugOverlayProps) {
  const parks = useMemo(() => parkEndpoints(endpoints), [endpoints])

  const transform =
    mapVersion && mapVersion.imageHeightPixels > 0 && mapVersion.resolution > 0
      ? {
          resolution: mapVersion.resolution,
          originX: mapVersion.originX,
          originY: mapVersion.originY,
          originYaw: mapVersion.originYaw,
          imageHeightPixels: mapVersion.imageHeightPixels,
        }
      : null

  const rows = robots.map((robot) => {
    const nearest = parks
      .map((p) => ({ park: p, d: dist(robot.poseX, robot.poseY, p.x, p.y) }))
      .sort((a, b) => a.d - b.d)[0]
    const px =
      transform != null
        ? worldToPixel(transform, { x: robot.poseX, y: robot.poseY })
        : null
    const stamp = robot.lastTelemetryAt ?? robot.lastHeartbeatAt
    const updated = stamp ? Date.parse(stamp) : NaN
    const ageMs = Number.isFinite(updated) ? Date.now() - updated : null
    const stale = ageMs != null && ageMs > STALE_MS
    const loc = robot.localizationStatus ?? '—'
    return { robot, nearest, px, ageMs, stale, loc }
  })

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-md rounded-md bg-surface/95 px-3 py-2 font-mono text-[10px] leading-relaxed text-ink-2 shadow-float">
      <div className="mb-1 font-sans text-[11px] font-medium text-ink">
        Map align debug · {mapVersion?.code ?? 'no map'}
        {trafficEpoch != null ? ` · traffic e${trafficEpoch}` : ''}
      </div>
      {transform ? (
        <div className="text-muted">
          origin ({transform.originX.toFixed(3)}, {transform.originY.toFixed(3)}) · res{' '}
          {transform.resolution} · {mapVersion?.imageWidthPixels}×{transform.imageHeightPixels}
        </div>
      ) : (
        <div className="text-amber">No occupancy transform on MapVersion</div>
      )}
      <div className="mt-1 text-muted">PARK (world m)</div>
      {parks.map((p) => {
        const pix = transform ? worldToPixel(transform, { x: p.x, y: p.y }) : null
        return (
          <div key={p.id}>
            {p.code}: ({p.x.toFixed(3)}, {p.y.toFixed(3)}, yaw {(p.yaw ?? 0).toFixed(3)})
            {pix ? ` → px (${pix.u.toFixed(1)}, ${pix.v.toFixed(1)})` : ''}
          </div>
        )
      })}
      <div className="mt-1 text-muted">Robots (backend PoseX/Y)</div>
      {rows.length === 0 ? <div>—</div> : null}
      {rows.map(({ robot, nearest, px, ageMs, stale, loc }) => (
        <div key={robot.code} className={stale ? 'text-amber' : undefined}>
          {robot.code}: ({robot.poseX.toFixed(3)}, {robot.poseY.toFixed(3)}, yaw{' '}
          {(robot.poseYaw ?? 0).toFixed(3)}) loc={loc}
          {px ? ` px (${px.u.toFixed(1)}, ${px.v.toFixed(1)})` : ''}
          {nearest
            ? ` · d(${nearest.park.code})=${nearest.d.toFixed(3)} m`
            : ''}
          {ageMs != null ? ` · age ${(ageMs / 1000).toFixed(1)}s` : ' · age ?'}
          {stale ? ' STALE' : ''}
          {robot.mapVersionCode ? ` · ${robot.mapVersionCode}` : ''}
        </div>
      ))}
    </div>
  )
}

export function isMapAlignDebugEnabled(): boolean {
  return import.meta.env.VITE_MAP_ALIGN_DEBUG === 'true'
}

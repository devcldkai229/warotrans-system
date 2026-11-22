import type { MapVersionDetailDto } from '../api/navigationApi';
import type { RobotPosePoint } from '../api/fleetApi';
import { endpointJobRole, type MapJobContext } from './mapLabels';
import type { MapPoint } from './mapTransform';

export const TRAIL_GAP_SECONDS = 30;
export const TRAIL_GAP_METERS = 0.5;

const FINISHED_OR_IDLE_STATUSES = new Set([
  'CREATED',
  'QUEUED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

export interface MapJobMovement {
  from: MapPoint;
  to: MapPoint;
  pickupId: string;
  dropoffId: string;
}

/** True while a job is actively running or paused and can still record new pose samples. */
export function isJobTrailLive(status?: string | null): boolean {
  if (!status) return false;
  return !FINISHED_OR_IDLE_STATUSES.has(status.toUpperCase());
}

/** Keep finite pose points that belong to `mapCode` (null mapVersionCode is retained for legacy robots). */
export function filterTrailPointsForMap(
  points: readonly RobotPosePoint[],
  mapCode: string | null | undefined,
): RobotPosePoint[] {
  const valid = points.filter(
    p => p && Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  if (!mapCode) return valid;
  return valid.filter(p => p.mapVersionCode === null || p.mapVersionCode === mapCode);
}

/** Split pose samples whenever telemetry had a gap (>30s and >0.5m), matching web pathModel.ts. */
export function buildTrailSegments(points: readonly RobotPosePoint[]): MapPoint[][] {
  const segments: MapPoint[][] = [];
  let current: MapPoint[] = [];

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const previous = points[i - 1];
    if (previous) {
      const prevMs = Date.parse(previous.at);
      const currMs = Date.parse(point.at);
      const seconds = Number.isFinite(prevMs) && Number.isFinite(currMs) ? (currMs - prevMs) / 1000 : 0;
      const meters = Math.hypot(point.x - previous.x, point.y - previous.y);
      if (seconds > TRAIL_GAP_SECONDS && meters > TRAIL_GAP_METERS) {
        if (current.length > 0) segments.push(current);
        current = [];
      }
    }
    current.push({ x: point.x, y: point.y });
  }

  if (current.length > 0) segments.push(current);
  return segments;
}

/** Resolve real Pickup -> Destination endpoints on the active map for the dashed job route vector. */
export function buildJobMovement(
  map: MapVersionDetailDto,
  jobContext?: MapJobContext,
): MapJobMovement | null {
  if (!jobContext) return null;

  const activeEndpoints = map.endpoints.filter(
    e => e.isEnabled && e.mapVersionId === map.id && Number.isFinite(e.x) && Number.isFinite(e.y),
  );
  const pickup = activeEndpoints.find(e => endpointJobRole(e, { pickupCode: jobContext.pickupCode }) === 'pickup');
  const dropoff = activeEndpoints.find(e => endpointJobRole(e, { dropoffCode: jobContext.dropoffCode }) === 'dropoff');

  if (!pickup || !dropoff || pickup.id === dropoff.id) return null;

  return {
    from: { x: pickup.x, y: pickup.y },
    to: { x: dropoff.x, y: dropoff.y },
    pickupId: pickup.id,
    dropoffId: dropoff.id,
  };
}

import type { TrafficSnapshot } from '../api/fleetApi';
import type { RobotResponse } from '../types/contracts';
import { PLAN_COLORS } from './mapStyle';

export interface MapPlannedPath {
  robotCode: string;
  color: string;
  points: { x: number; y: number }[];
  grantedCount: number;
  goalYaw?: number | null;
  waiting: boolean;
}

/**
 * Extract live Nav2 planned paths from the traffic coordinator snapshot for online robots
 * currently located on `mapId`. Mirrors the web console's deterministic per-robot color assignment.
 */
export function buildPlannedPaths(
  snapshot: TrafficSnapshot | null | undefined,
  robots: readonly RobotResponse[],
  mapId: string,
): MapPlannedPath[] {
  if (!snapshot?.robots?.length || !robots.length || !mapId) return [];

  const mapRobots = robots.filter(r => r.currentMapVersionId === mapId && r.isOnline);
  if (!mapRobots.length) return [];

  const sortedCodes = mapRobots.map(r => r.code).sort((a, b) => a.localeCompare(b));
  const byId = new Map(mapRobots.map(r => [r.id, r]));

  const out: MapPlannedPath[] = [];
  for (const trafficRobot of snapshot.robots) {
    const robot = byId.get(trafficRobot.robotId);
    if (!robot || !Array.isArray(trafficRobot.proposedPath) || trafficRobot.proposedPath.length === 0) {
      continue;
    }

    const validPath = trafficRobot.proposedPath.filter(
      p => p && Number.isFinite(p.x) && Number.isFinite(p.y),
    );
    if (!validPath.length) continue;

    const hasStart = Number.isFinite(trafficRobot.x) && Number.isFinite(trafficRobot.y);
    const points = hasStart
      ? [{ x: trafficRobot.x as number, y: trafficRobot.y as number }, ...validPath.map(p => ({ x: p.x, y: p.y }))]
      : validPath.map(p => ({ x: p.x, y: p.y }));

    if (points.length < 2) continue;

    const rawGranted = Number.isFinite(trafficRobot.grantedPathPoints)
      ? Math.max(0, Math.floor(trafficRobot.grantedPathPoints as number))
      : 0;
    const granted = Math.min(rawGranted, validPath.length);
    const last = validPath[validPath.length - 1];
    const colorIdx = Math.max(0, sortedCodes.indexOf(robot.code));

    out.push({
      robotCode: robot.code,
      color: PLAN_COLORS[colorIdx % PLAN_COLORS.length],
      points,
      grantedCount: granted > 0 ? granted + (hasStart ? 1 : 0) : 0,
      goalYaw: Number.isFinite(last.yaw) ? last.yaw : null,
      waiting: granted === 0,
    });
  }

  return out;
}

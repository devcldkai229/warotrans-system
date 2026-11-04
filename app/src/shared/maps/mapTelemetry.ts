import type { RobotResponse } from '../types/contracts';
import type { MapVersionDetailDto } from '../api/navigationApi';
import { worldToMapPercent } from '../utils/mapCoordinates';

export interface MapRobotState {
  label: string;
  canFollow: boolean;
  showPose: boolean;
  lastReported: boolean;
  ageSeconds: number | null;
}

export type MapUpdateMode = 'live' | 'polling' | 'paused' | 'unavailable';

export function mapUpdateLabel(mode: MapUpdateMode): string {
  return mode === 'live' ? 'Live Updates' : mode === 'paused' ? 'Updates Paused'
    : mode === 'unavailable' ? 'Updates Unavailable' : 'Polling · 5s';
}

/** SignalR-triggered REST snapshots always keep pose and map identity together. */
export function mapRobotState(robot: RobotResponse, map: MapVersionDetailDto, now: number, mode: MapUpdateMode = 'polling'): MapRobotState {
  const base = { canFollow: false, showPose: false, lastReported: true, ageSeconds: null };
  if (robot.currentMapVersionId !== map.id) return { ...base, label: 'Different Map' };
  if (robot.mapVersionCode && robot.mapVersionCode !== map.code) return { ...base, label: 'Robot Reports A Different Map' };
  if (map.frameId !== 'map') return { ...base, label: 'Pose Frame Unavailable' };
  const point = worldToMapPercent(robot.poseX,robot.poseY,map);
  if (!point || !Number.isFinite(robot.poseYaw) || !robot.lastTelemetryAt) return { ...base, label: 'Pose Unavailable' };
  const timestamp = Date.parse(robot.lastTelemetryAt);
  const age = now-timestamp;
  const validTime = Number.isFinite(age) && age >= -5_000;
  const state = { ...base, showPose: true, ageSeconds: validTime ? Math.max(0,Math.floor(age/1000)) : null };
  if (point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100) return { ...state, showPose: false, label: 'Out Of Bounds' };
  if (!robot.isOnline) return { ...state, label: 'Offline · Last Reported' };
  if (robot.localizationStatus !== 'LOCALIZED') return { ...state, label: 'Localization Unavailable' };
  if (!validTime) return { ...state, label: 'Timestamp Unavailable' };
  if (age > 15_000) return { ...state, label: 'Stale · Last Reported' };
  if (mode === 'paused' || mode === 'unavailable') return { ...state, label: `${mapUpdateLabel(mode)} · Last Reported` };
  return { ...state, canFollow: true, lastReported: false, label: mode === 'live' ? 'Live Position' : 'Pose Snapshot' };
}

export function sampleAgeLabel(age: number | null): string {
  if (age == null) return 'Time Unavailable';
  if (age < 60) return `${age}s ago`;
  if (age < 3600) return `${Math.floor(age/60)}m ago`;
  return `${Math.floor(age/3600)}h ago`;
}

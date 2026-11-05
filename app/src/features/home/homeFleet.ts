import type { OperatingContext } from '../../shared/api/operatingContextApi';
import type { RobotResponse } from '../../shared/types/contracts';
import type { MapUpdateMode } from '../../shared/maps/mapTelemetry';

export interface HomeFleetRobot {
  id: string;
  statusLabel: string;
  active: boolean;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  lastReported: boolean;
  battery: number | null;
  speed: string;
}

/** The roster shares the operating map's identity; map layers retain the full fleet. */
export function homeFleetOnMap(robots: RobotResponse[], context?: OperatingContext | null, updateMode: MapUpdateMode = 'polling'): HomeFleetRobot[] {
  if (!context || context.map.warehouseId !== context.warehouse.id) return [];
  const current = updateMode !== 'unavailable' && updateMode !== 'paused';
  return robots.filter(robot => robot.warehouseId === context.warehouse.id
    && robot.currentMapVersionId === context.map.id).map(robot => {
    const active = current && robot.isEnabled && robot.isOnline;
    const reportedStatus = !robot.isEnabled ? (robot.isOnline ? 'Disabled · Online' : 'Disabled · Offline')
      : !robot.isOnline ? 'Offline'
      : robot.status === 'OFFLINE' ? 'Online · Not Ready'
      : robot.status.charAt(0) + robot.status.slice(1).toLowerCase();
    const tone = !active ? 'neutral' : robot.status === 'ERROR' ? 'danger'
      : robot.status === 'PAUSED' || robot.status === 'MAINTENANCE' ? 'warning'
      : robot.status === 'AVAILABLE' ? 'success' : 'info';
    return {
      id: robot.code, statusLabel: current ? reportedStatus : `Last Reported · ${reportedStatus}`,
      active, tone, lastReported: !current || !robot.isOnline,
      battery: Number.isFinite(robot.batteryPercent) ? Math.round(robot.batteryPercent) : null,
      speed: typeof robot.linearVelocity === 'number' && Number.isFinite(robot.linearVelocity)
        ? `${robot.linearVelocity.toFixed(2)} m/s` : '—',
    };
  });
}

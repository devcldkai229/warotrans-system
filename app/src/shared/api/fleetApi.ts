import { apiFetch } from './client';
import type { ListRobotsResponse, RobotResponse } from '../types/contracts';

export type RobotDto = RobotResponse;

export const FALLBACK_ROBOTS: RobotResponse[] = [
  {
    id: '00000000-0000-0000-0002-000000000001',
    warehouseId: '11111111-1111-1111-1111-111111111111',
    currentMapVersionId: '22222222-2222-2222-2222-222222222222',
    code: 'AMR-01',
    name: 'Carrier AMR-01',
    status: 'AVAILABLE',
    isOnline: true,
    batteryPercent: 88,
    poseX: 18.5,
    poseY: 12.2,
    poseYaw: 1.57,
    lastHeartbeatAt: new Date().toISOString(),
    lastTelemetryAt: new Date().toISOString(),
    navigationStatus: 'NAVIGATING',
    localizationStatus: 'LOCALIZED',
    linearVelocity: 1.2,
    angularVelocity: 0.0,
    errorCode: null,
    mapVersionCode: 'MAP-V1',
    currentCommandId: null,
    isEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0002-000000000002',
    warehouseId: '11111111-1111-1111-1111-111111111111',
    currentMapVersionId: '22222222-2222-2222-2222-222222222222',
    code: 'AMR-02',
    name: 'Carrier AMR-02',
    status: 'AVAILABLE',
    isOnline: true,
    batteryPercent: 94,
    poseX: 32.1,
    poseY: 8.4,
    poseYaw: 0.0,
    lastHeartbeatAt: new Date().toISOString(),
    lastTelemetryAt: new Date().toISOString(),
    navigationStatus: 'IDLE',
    localizationStatus: 'LOCALIZED',
    linearVelocity: 0.0,
    angularVelocity: 0.0,
    errorCode: null,
    mapVersionCode: 'MAP-V1',
    currentCommandId: null,
    isEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/**
 * Retrieves the fleet of robots registered in the facility (`GET /api/fleet/robots`).
 * Gracefully falls back to AMR-01 and AMR-02 if the backend is unreachable.
 */
export async function listRobots(params?: {
  warehouseId?: string;
  isOnline?: boolean;
}): Promise<ListRobotsResponse> {
  try {
    const query = new URLSearchParams();
    if (params?.warehouseId) query.set('warehouseId', params.warehouseId);
    if (params?.isOnline !== undefined) query.set('isOnline', String(params.isOnline));
    const qs = query.toString();
    const url = `/api/fleet/robots${qs ? `?${qs}` : ''}`;
    const res = await apiFetch<ListRobotsResponse>(url);
    if (res && Array.isArray(res.items) && res.items.length > 0) {
      return res;
    }
    return { items: FALLBACK_ROBOTS, total: FALLBACK_ROBOTS.length };
  } catch (err) {
    console.warn('Failed to list fleet robots from backend, using fallback:', err);
    return { items: FALLBACK_ROBOTS, total: FALLBACK_ROBOTS.length };
  }
}

/**
 * Retrieves details for a specific robot (`GET /api/fleet/robots/:id`).
 */
export async function getRobot(id: string): Promise<RobotDto> {
  try {
    return await apiFetch<RobotDto>(`/api/fleet/robots/${id}`);
  } catch (err) {
    const fallback = FALLBACK_ROBOTS.find((r) => r.id === id || r.code === id);
    if (fallback) return fallback;
    throw err;
  }
}

/**
 * Issues an emergency cancel/recall command to a robot (`POST /api/fleet/robots/:id/commands/cancel`).
 */
export async function cancelRobotCommand(
  id: string,
  reason?: string,
  targetCommandId?: string | null,
): Promise<any> {
  return apiFetch<any>(`/api/fleet/robots/${id}/commands/cancel`, {
    method: 'POST',
    body: JSON.stringify({
      targetCommandId: targetCommandId ?? null,
      reason: reason || 'Operator emergency recall from Mobile App',
    }),
  });
}

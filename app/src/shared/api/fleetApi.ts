import { apiFetch } from './client';
import type { ListRobotsResponse, RobotResponse } from '../types/contracts';
export type RobotDto = RobotResponse;
// Existing initializers start empty until the server answers.
export const FALLBACK_ROBOTS: RobotResponse[] = [];
export function listRobots(params: { warehouseId?: string; isOnline?: boolean } = {}): Promise<ListRobotsResponse> {
  const query = new URLSearchParams();
  if (params.warehouseId) query.set('warehouseId', params.warehouseId);
  if (params.isOnline !== undefined) query.set('isOnline', String(params.isOnline));
  return apiFetch<ListRobotsResponse>(`/api/fleet/robots${query.size ? `?${query}` : ''}`);
}
export function getRobot(id: string) { return apiFetch<RobotDto>(`/api/fleet/robots/${id}`); }
export function cancelRobotCommand(id: string, reason?: string, targetCommandId?: string | null) {
  return apiFetch<{ commandId: string; targetCommandId: string; robotId: string; status: string }>(
    `/api/fleet/robots/${id}/commands/cancel`, { method: 'POST', body: JSON.stringify({ targetCommandId: targetCommandId ?? null, reason }) });
}

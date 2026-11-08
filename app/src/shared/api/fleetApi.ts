import { apiFetch, ApiError } from './client';
import type { ListRobotsResponse, RobotResponse } from '../types/contracts';
export type RobotDto = RobotResponse;
// Existing initializers start empty until the server answers.
export const FALLBACK_ROBOTS: RobotResponse[] = [];
export async function listRobots(params: { warehouseId?: string; isOnline?: boolean } = {}, signal?: AbortSignal): Promise<ListRobotsResponse> {
  const query = new URLSearchParams();
  if (params.warehouseId) query.set('warehouseId', params.warehouseId);
  if (params.isOnline === undefined) return apiFetch<ListRobotsResponse>(`/api/fleet/robots${query.size ? `?${query}` : ''}`, { signal });

  // BE has no isOnline query. Filter only after loading every supported page.
  query.set('take', '100');
  const robots = new Map<string, RobotResponse>();
  let skip = 0;
  while (true) {
    query.set('skip', String(skip));
    const page = await apiFetch<ListRobotsResponse>(`/api/fleet/robots?${query}`, { signal });
    page.items.forEach(robot => robots.set(robot.id, robot));
    skip += page.items.length;
    if (skip >= page.total) break;
    if (!page.items.length) throw new ApiError(502, 'fleet_list_incomplete', 'The complete robot list could not be loaded. Try again.');
  }
  const items = [...robots.values()].filter(robot => robot.isOnline === params.isOnline);
  return { items, total: items.length };
}
export function getRobot(id: string) { return apiFetch<RobotDto>(`/api/fleet/robots/${id}`); }
export function cancelRobotCommand(id: string, reason?: string, targetCommandId?: string | null) {
  return apiFetch<{ commandId: string; targetCommandId: string; robotId: string; status: string }>(
    `/api/fleet/robots/${id}/commands/cancel`, { method: 'POST', body: JSON.stringify({ targetCommandId: targetCommandId ?? null, reason }) });
}

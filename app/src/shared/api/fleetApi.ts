import { apiFetch, ApiError, getAccessToken } from './client';
import { requireMobileCapability } from './capabilities';
import type {
  ListRobotsResponse, ManualLeaseResponse, RobotResponse, TeleopRobotResponse,
} from '../types/contracts';
export type RobotDto = RobotResponse;
const callerToken = () => (typeof getAccessToken === 'function' ? getAccessToken() : undefined);
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
export type StopStateValue = 'NONE' | 'REQUESTED' | 'ACCEPTED' | 'STOPPED_VERIFIED' | 'REJECTED' | 'UNKNOWN';
export interface StopStateResponse {
  robotId: string;
  state: StopStateValue | string;
  motionHeld: boolean;
  commandId: string | null;
  mode: string | null;
  commandStatus: string | null;
  outcome: string | null;
  errorCode: string | null;
  issuedAt: string | null;
  completedAt: string | null;
}
export async function getRobotStopState(robotId: string, signal?: AbortSignal): Promise<StopStateResponse> {
  const result = await apiFetch<StopStateResponse>(`/api/fleet/robots/${encodeURIComponent(robotId)}/stop-state`, { signal });
  if (!result || result.robotId !== robotId || typeof result.state !== 'string' || typeof result.motionHeld !== 'boolean') {
    throw new ApiError(502, 'stop_state_invalid', 'Could not verify the robot stop state. Refresh and try again.');
  }
  return result;
}
function validStopState(robotId: string, result: StopStateResponse): StopStateResponse {
  if (!result || result.robotId !== robotId || typeof result.state !== 'string' || typeof result.motionHeld !== 'boolean') {
    throw new ApiError(502, 'stop_state_invalid', 'Could not verify the robot stop state. Refresh and try again.');
  }
  return result;
}
function validManualLease(robotId: string, result: ManualLeaseResponse): ManualLeaseResponse {
  if (!result || result.robotId !== robotId || typeof result.active !== 'boolean' || typeof result.heldByMe !== 'boolean') {
    throw new ApiError(502, 'manual_lease_invalid', 'Could not verify the manual-drive lease state. Refresh and try again.');
  }
  return result;
}
export async function getManualLease(robotId: string, signal?: AbortSignal): Promise<ManualLeaseResponse> {
  const result = await apiFetch<ManualLeaseResponse>(
    `/api/fleet/robots/${encodeURIComponent(robotId)}/manual/lease`,
    { signal },
  );
  return validManualLease(robotId, result);
}
export async function acquireManualLease(
  robotId: string,
  options: { takeover?: boolean; reason?: string } = {},
): Promise<ManualLeaseResponse> {
  requireMobileCapability('manualDriveTeleop');
  const result = await apiFetch<ManualLeaseResponse>(
    `/api/fleet/robots/${encodeURIComponent(robotId)}/manual/lease`,
    {
      method: 'POST',
      body: JSON.stringify({
        takeover: Boolean(options.takeover),
        reason: options.reason?.trim() || null,
      }),
    },
    callerToken(),
  );
  return validManualLease(robotId, result);
}
export async function releaseManualLease(robotId: string): Promise<void> {
  await apiFetch<null>(
    `/api/fleet/robots/${encodeURIComponent(robotId)}/manual/lease`,
    { method: 'DELETE' },
    callerToken(),
  );
}
export async function teleopRobot(
  robotId: string,
  linear: number,
  angular: number,
  assist = true,
  signal?: AbortSignal,
): Promise<TeleopRobotResponse> {
  requireMobileCapability('manualDriveTeleop');
  if (!Number.isFinite(linear) || !Number.isFinite(angular)) {
    throw new ApiError(400, 'teleop_invalid_velocity', 'Velocity setpoints must be finite numbers.');
  }
  const hasTokenReader = typeof getAccessToken === 'function';
  const token = hasTokenReader ? getAccessToken() : undefined;
  if (hasTokenReader && !token) {
    throw new ApiError(401, 'unauthenticated', 'Your session expired. Sign in again before driving.');
  }
  // Never leave overrideToken === undefined on teleop: expired sessions must stop instead of refreshing and replaying stale velocity.
  const boundToken = token ?? null;
  return apiFetch<TeleopRobotResponse>(
    `/api/fleet/robots/${encodeURIComponent(robotId)}/teleop`,
    {
      method: 'POST',
      body: JSON.stringify({ linear, angular, assist }),
      signal,
    },
    boundToken,
  );
}
export async function stopRobot(
  robotId: string,
  mode: 'STOP' | 'PAUSE' = 'STOP',
  reason?: string,
): Promise<StopStateResponse> {
  const result = await apiFetch<StopStateResponse>(
    `/api/fleet/robots/${encodeURIComponent(robotId)}/commands/stop`,
    {
      method: 'POST',
      body: JSON.stringify({ mode, reason: reason?.trim() || null }),
    },
    callerToken(),
  );
  return validStopState(robotId, result);
}
export async function resumeRobotMotion(robotId: string): Promise<StopStateResponse> {
  const result = await apiFetch<StopStateResponse>(
    `/api/fleet/robots/${encodeURIComponent(robotId)}/commands/resume`,
    { method: 'POST' },
    callerToken(),
  );
  return validStopState(robotId, result);
}
export function getRobot(id: string) { return apiFetch<RobotDto>(`/api/fleet/robots/${id}`); }
/**
 * Tells the robot it stands at `endpointId` of its map (an operator placed it there). 202 means the command was
 * accepted; the robot reports LOCALIZED in localizationStatus once its pose estimate converged. Refused while it runs a command.
 */
export function localizeRobot(id: string, endpointId: string) {
  return apiFetch<{ commandId: string }>(`/api/fleet/robots/${id}/commands/localize`, { method: 'POST', body: JSON.stringify({ endpointId }) });
}
export function cancelRobotCommand(id: string, reason?: string, targetCommandId?: string | null) {
  return apiFetch<{ commandId: string; targetCommandId: string; robotId: string; status: string }>(
    `/api/fleet/robots/${id}/commands/cancel`, { method: 'POST', body: JSON.stringify({ targetCommandId: targetCommandId ?? null, reason }) });
}

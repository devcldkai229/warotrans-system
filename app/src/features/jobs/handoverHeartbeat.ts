import type { HandoverStopResponse } from '../../shared/types/contracts';

export const DEFAULT_HANDOVER_HEARTBEAT_SECONDS = 5;

export function pickPreBeginHeartbeatTargets(
  stops: Pick<HandoverStopResponse, 'id' | 'jobId' | 'moveId' | 'version' | 'claimedBy' | 'beganAt' | 'heartbeatIntervalSeconds'>[],
  accountId?: string | null,
) {
  if (!accountId || !Array.isArray(stops)) return [];
  return stops.filter(stop => stop.claimedBy === accountId && !stop.beganAt);
}

export function computeHeartbeatIntervalMs(
  stops: Pick<HandoverStopResponse, 'heartbeatIntervalSeconds'>[],
): number {
  const candidates = (stops || [])
    .map(stop => stop.heartbeatIntervalSeconds)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 1);
  const seconds = candidates.length > 0 ? Math.min(...candidates) : DEFAULT_HANDOVER_HEARTBEAT_SECONDS;
  return Math.max(1, seconds) * 1000;
}

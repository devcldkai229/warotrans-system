import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../features/auth/authContext';
import {
  computeHeartbeatIntervalMs,
  pickPreBeginHeartbeatTargets,
} from '../../features/jobs/handoverHeartbeat';
import { heartbeatHandoverStop, listHandoverStops } from '../api/executionApi';
import { PERMISSIONS, sessionCan } from '../auth/permissions';

export function useHandoverStopHeartbeat(
  appActive: boolean,
  accessToken: string | null,
  refreshTrigger: unknown,
) {
  const { session } = useAuth();
  const client = useQueryClient();
  const canOperate = sessionCan(session, PERMISSIONS.jobOperate);
  const enabled = Boolean(session?.id && accessToken && canOperate && appActive);

  const myStopsQuery = useQuery({
    queryKey: ['handover-stops-mine', session?.id],
    queryFn: ({ signal }) => listHandoverStops({ mine: true, signal }),
    enabled,
    refetchInterval: enabled ? 10_000 : false,
    retry: false,
  });

  const { refetch } = myStopsQuery;
  useEffect(() => {
    if (enabled && refreshTrigger) {
      void refetch();
    }
  }, [enabled, refreshTrigger, refetch]);

  const targets = useMemo(
    () => pickPreBeginHeartbeatTargets(myStopsQuery.data ?? [], session?.id),
    [myStopsQuery.data, session?.id],
  );
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  const intervalMs = useMemo(() => computeHeartbeatIntervalMs(targets), [targets]);
  const targetSignature = targets.map(item => `${item.jobId}:${item.id}:${item.moveId}:${item.version}`).join(',');

  useEffect(() => {
    if (!enabled || !targetSignature) {
      return;
    }
    let cancelled = false;
    const sendHeartbeats = async () => {
      const currentTargets = targetsRef.current;
      if (!currentTargets.length || cancelled) return;
      let shouldRefresh = false;
      for (const stop of currentTargets) {
        if (cancelled) return;
        try {
          await heartbeatHandoverStop(stop.jobId, stop.id, stop.moveId, stop.version);
        } catch {
          shouldRefresh = true;
        }
      }
      if (shouldRefresh && !cancelled) {
        void client.invalidateQueries({ queryKey: ['handover-stops'] });
        void client.invalidateQueries({ queryKey: ['handover-stops-mine'] });
      }
    };
    const timer = setInterval(() => {
      void sendHeartbeats();
    }, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, targetSignature, intervalMs, client]);
}

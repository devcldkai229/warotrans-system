import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getRobotPoseHistory } from '../../api/fleetApi';
import type { RobotResponse } from '../../types/contracts';
import type { MapJobContext } from '../mapLabels';
import {
  buildTrailSegments,
  filterTrailPointsForMap,
  isJobTrailLive,
} from '../mapTrails';
import type { MapPoint } from '../mapTransform';

/**
 * Fetches actual recorded robot movement poses (`robot.read`, available to Staff, Technician,
 * and Admin) for the active Job and turns them into map-filtered polyline trail segments.
 */
export function useMapJobTrail({
  enabled,
  jobContext,
  robots,
  mapId,
  mapCode,
}: {
  enabled: boolean;
  jobContext?: MapJobContext;
  robots: readonly RobotResponse[];
  mapId: string;
  mapCode: string;
}): { trailSegments: MapPoint[][] } {
  const [active, setActive] = useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => sub.remove();
  }, []);

  const targetRobotId = useMemo(() => {
    if (jobContext?.robotId) return jobContext.robotId;
    const code = jobContext?.robotCode;
    if (!code) return undefined;
    return (
      robots.find(r => r.currentMapVersionId === mapId && (r.code === code || r.id === code))?.id ??
      robots.find(r => r.code === code || r.id === code)?.id
    );
  }, [jobContext?.robotId, jobContext?.robotCode, robots, mapId]);

  const jobId = jobContext?.jobId ?? null;
  const status = jobContext?.status ?? null;
  const canQuery =
    enabled &&
    active &&
    Boolean(jobId) &&
    Boolean(targetRobotId) &&
    status !== 'CREATED' &&
    status !== 'QUEUED';
  const live = isJobTrailLive(status);

  const query = useQuery({
    queryKey: ['map-job-pose-history', targetRobotId, jobId],
    queryFn: ({ signal }) =>
      getRobotPoseHistory(targetRobotId!, { jobId: jobId!, limit: 1000 }, signal),
    enabled: canQuery,
    refetchInterval: canQuery && live ? 3_500 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const trailSegments = useMemo(
    () =>
      enabled && query.data?.points?.length
        ? buildTrailSegments(filterTrailPointsForMap(query.data.points, mapCode))
        : [],
    [enabled, query.data?.points, mapCode],
  );

  return { trailSegments };
}

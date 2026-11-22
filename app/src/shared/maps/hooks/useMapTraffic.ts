import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getTrafficSnapshot } from '../../api/fleetApi';
import type { RobotResponse } from '../../types/contracts';
import { buildPlannedPaths, type MapPlannedPath } from '../mapTraffic';

/**
 * Polls the authoritative traffic coordinator snapshot ONLY when `enabled` is true
 * (caller has `PERMISSIONS.trafficRead`, i.e., Admin/Technician). Staff users never fire this request.
 */
export function useMapTraffic({
  enabled,
  robots,
  mapId,
}: {
  enabled: boolean;
  robots: readonly RobotResponse[];
  mapId: string;
}): { plannedPaths: MapPlannedPath[]; isFetching: boolean } {
  const [active, setActive] = useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => sub.remove();
  }, []);

  const query = useQuery({
    queryKey: ['map-traffic-snapshot'],
    queryFn: ({ signal }) => getTrafficSnapshot(signal),
    enabled: enabled && active && !!mapId,
    refetchInterval: enabled && active && !!mapId ? 2_500 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const plannedPaths = useMemo(
    () => (enabled ? buildPlannedPaths(query.data, robots, mapId) : []),
    [enabled, query.data, robots, mapId],
  );

  return { plannedPaths, isFetching: query.isFetching };
}

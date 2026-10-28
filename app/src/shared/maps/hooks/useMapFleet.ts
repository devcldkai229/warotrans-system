import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { listRobots } from '../../api/fleetApi';
import { realtimeClient } from '../../realtime/realtimeClient';
import type { RobotResponse } from '../../types/contracts';
import { subscribeMapFleetUpdates } from '../mapRefreshQueue';
import type { MapUpdateMode } from '../mapTelemetry';

const EMPTY_FLEET: RobotResponse[] = [];

/** SignalR triggers bounded snapshot refreshes; REST keeps map identity and pose atomic. */
export function useMapFleet(sessionKey: string) {
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [connected, setConnected] = useState(realtimeClient.isConnected);
  const query = useQuery({
    queryKey: ['map-fleet', sessionKey],
    queryFn: ({ signal }) => listRobots({}, signal),
    enabled: !!sessionKey && active,
    refetchInterval: active ? 5_000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const { refetch } = query;

  useEffect(() => {
    const lifecycle = AppState.addEventListener('change', state => setActive(state === 'active'));
    const unsubscribe = realtimeClient.onConnectionStateChange(setConnected);
    return () => { lifecycle.remove(); unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!sessionKey || !active) return;
    // Do not cancel a GET already in progress: a trailing refresh catches events during that GET.
    // Revalidate immediately after foreground/reconnect, including robot map changes while away.
    return subscribeMapFleetUpdates(realtimeClient, () => refetch({ cancelRefetch: false }));
  }, [sessionKey, active, connected, refetch]);

  const updateMode: MapUpdateMode = !active ? 'paused' : query.isError ? 'unavailable' : connected ? 'live' : 'polling';
  return { ...query, robots: query.data?.items || EMPTY_FLEET, updateMode };
}

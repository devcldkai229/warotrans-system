import { useEffect, useState } from 'react';
import { listWarehouses } from '../api/warehouseApi';
import { listRobots } from '../api/fleetApi';
import { listJobs } from '../api/executionApi';
import { getActiveMapVersion, getMapVersionDetail } from '../api/navigationApi';
import { useRealtime } from '../realtime';
import { useRemoteData } from './useRemoteData';

export function useFacilityData(mapVersionId?: string) {
  const live = useRealtime();
  const warehouses = useRemoteData(() => listWarehouses({ isActive: true }));
  const [warehouseId, setWarehouseId] = useState('');
  useEffect(() => { if (warehouses.data) setWarehouseId(warehouses.data.items[0]?.id ?? ''); }, [warehouses.data]);
  const state = useRemoteData(async () => {
    if (!warehouseId && !mapVersionId) return null;
    const observedAt = Date.now();
    const mapVersion = mapVersionId ? null : await getActiveMapVersion(warehouseId);
    const mapId = mapVersionId ?? mapVersion?.id;
    const map = mapId ? await getMapVersionDetail(mapId) : null;
    const [fleet, running, created, queued] = await Promise.all([
      listRobots({ warehouseId: map?.warehouseId ?? warehouseId }),
      listJobs({ status: 'RUNNING', take: 100 }), listJobs({ status: 'CREATED', take: 100 }), listJobs({ status: 'QUEUED', take: 100 }),
    ]);
    return { observedAt, map, robots: fleet.items, jobs: [...running.items, ...created.items, ...queued.items].filter(job => job.mapVersionId === map?.id) };
  }, [warehouseId, mapVersionId, live.resyncVersion, live.lastJobUpdate]);
  const robots = (state.data?.robots ?? []).map(robot => {
    const telemetry = live.robotTelemetry[robot.code];
    const event = live.robotConnectivity[robot.code];
    const connectivity = event?.observedAt && event.observedAt >= (state.data?.observedAt ?? 0) ? event : undefined;
    const newer = telemetry?.lastTelemetryAt && (!robot.lastTelemetryAt || Date.parse(telemetry.lastTelemetryAt) >= Date.parse(robot.lastTelemetryAt));
    return { ...robot, ...(newer ? telemetry : {}),
      ...(connectivity ? { isOnline: connectivity.isOnline, status: connectivity.status, lastHeartbeatAt: connectivity.lastHeartbeatAt } : {}) };
  });
  return { ...state, warehouses: warehouses.data?.items ?? [], warehouseId, setWarehouseId,
    loading: state.loading || warehouses.loading, error: state.error ?? warehouses.error,
    robots, jobs: state.data?.jobs ?? [], map: state.data?.map ?? null, isConnected: live.isConnected };
}

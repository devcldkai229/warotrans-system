import React from 'react';
import { OperationalScreen } from '../../app/shell/OperationalScreen';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useFacilityData } from '../../shared/hooks/useFacilityData';
import { Button, Card, ChoiceField, Text, StatusPill } from '../../shared/ui';
import { MiniFacilityMap } from '../home/MiniFacilityMap';
export function JobLiveMapScreen() {
  const { params, navigate } = useNavigation();
  const state = useFacilityData(typeof params.mapVersionId === 'string' ? params.mapVersionId : undefined);
  return <OperationalScreen title="Live Facility Map" loading={state.loading} error={state.error} onRefresh={state.reload}>
    {!params.mapVersionId && <ChoiceField label="Warehouse" value={state.warehouseId} onChange={state.setWarehouseId} options={state.warehouses.map(w => ({ value: w.id, label: w.name }))} />}
    <Text color={state.isConnected ? 'textSecondary' : 'warningText'}>{state.isConnected ? 'Live Updates Connected' : 'Live Updates Disconnected · Positions May Be Stale'}</Text>
    <MiniFacilityMap map={state.map} robots={state.robots} />
    {state.robots.map(robot => <Card key={robot.id} gap={8}>
      <Text variant="headline">{robot.code}</Text><StatusPill status={robot.status} />
      <Text variant="code">X {robot.poseX.toFixed(2)} m · Y {robot.poseY.toFixed(2)} m · Yaw {robot.poseYaw.toFixed(2)} rad</Text>
      <Text>Battery {robot.batteryPercent}% · {robot.isOnline ? 'Online' : 'Offline'}</Text>
      <Text>Navigation: {robot.navigationStatus ?? 'Not Reported'} · Localization: {robot.localizationStatus ?? 'Not Reported'}</Text>
      <Text variant="caption">Last Telemetry: {robot.lastTelemetryAt ? new Date(robot.lastTelemetryAt).toLocaleString() : 'Not Reported'}</Text>
    </Card>)}
    <Text variant="headline">Active Jobs On This Map</Text>
    {state.jobs.map(job => <Button key={job.id} title={`${job.jobNo} · ${job.status}`} variant="outline" onPress={() => navigate('job_detail', { jobId: job.id })} />)}
    {!state.loading && !state.error && !state.jobs.length && <Text>No Active Jobs</Text>}
    {state.map?.endpoints.map(endpoint => <Text key={endpoint.id} variant="caption">{endpoint.code} · {endpoint.name} · ({endpoint.x}, {endpoint.y})</Text>)}
  </OperationalScreen>;
}

import React, { useEffect } from 'react';
import { OperationalScreen } from '../../app/shell/OperationalScreen';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { useFacilityData } from '../../shared/hooks/useFacilityData';
import { Button, Card, ChoiceField, StatusPill, Text } from '../../shared/ui';
import { MiniFacilityMap } from './MiniFacilityMap';
export function HomeScreen() {
  const { navigate, setActiveJobCount } = useNavigation();
  const { session } = useAuth();
  const state = useFacilityData();
  useEffect(() => { setActiveJobCount(state.jobs.length); }, [state.data, setActiveJobCount]);
  return <OperationalScreen title="Home" header={false} back={false} loading={state.loading} error={state.error} onRefresh={state.reload}>
    <Text variant="title">Hello, {session?.fullName}</Text>
    <Text color={state.isConnected ? 'textSecondary' : 'warningText'}>{state.isConnected ? 'Live Updates Connected' : 'Live Updates Disconnected · Showing Last REST Snapshot'}</Text>
    <ChoiceField label="Warehouse" value={state.warehouseId} onChange={state.setWarehouseId} options={state.warehouses.map(w => ({ value: w.id, label: w.name }))} />
    <Card gap={10}>
      <Text variant="headline">Facility Map</Text>
      <MiniFacilityMap map={state.map} robots={state.robots} onPress={() => navigate('live_map', { mapVersionId: state.map?.id })} />
    </Card>
    <Button title="Create Transport Request" onPress={() => navigate('transport_create', { warehouseId: state.warehouseId })} />
    <Text variant="headline">Active Jobs{state.data ? ` (${state.jobs.length})` : ''}</Text>
    {state.jobs.map(job => <Card key={job.id} gap={10} onPress={() => navigate('job_detail', { jobId: job.id })}>
      <Text variant="headline">{job.jobNo}</Text><StatusPill status={job.status} />
      <Text>{job.containerCount} Containers · {job.completedSteps}/{job.totalSteps} Steps</Text>
    </Card>)}
    {!state.loading && !state.error && !state.jobs.length && <Text>No Active Jobs On This Map</Text>}
    <Text variant="headline">Robots{state.data ? ` (${state.robots.length})` : ''}</Text>
    {state.robots.map(robot => <Card key={robot.id} gap={8}>
      <Text variant="headline">{robot.code}</Text><StatusPill status={robot.status} />
      <Text>{robot.isOnline ? 'Online' : 'Offline'} · Battery {robot.batteryPercent == null ? 'No sensor' : `${robot.batteryPercent}%`}</Text>
      <Text variant="caption">Last Telemetry: {robot.lastTelemetryAt ? new Date(robot.lastTelemetryAt).toLocaleString() : 'Not Reported'}</Text>
    </Card>)}
  </OperationalScreen>;
}

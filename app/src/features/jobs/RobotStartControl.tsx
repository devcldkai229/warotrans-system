import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { listRobots } from '../../shared/api/fleetApi';
import { startJob } from '../../shared/api/executionApi';
import { useRemoteData } from '../../shared/hooks/useRemoteData';
import { Button, ChoiceField, ErrorBanner, Text } from '../../shared/ui';
import type { JobDetailResponse } from '../../shared/types/contracts';
import { useRealtime } from '../../shared/realtime';

export function RobotStartControl({ jobId, mapVersionId, onStarted }: {
  jobId: string; mapVersionId: string; onStarted: (job: JobDetailResponse) => void;
}) {
  const { resyncVersion, robotConnectivity } = useRealtime();
  const robots = useRemoteData(() => listRobots({ isEnabled: true }), [resyncVersion, robotConnectivity]);
  const [selectedRobotId, setSelectedRobotId] = useState('');
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eligible = robots.data?.items.filter(r => r.currentMapVersionId === mapVersionId && r.status === 'AVAILABLE' && r.isOnline && r.isEnabled) ?? [];
  const run = async () => {
    if (lock.current || !eligible.some(r => r.id === selectedRobotId)) return;
    lock.current = true;
    setBusy(true); setError(null);
    try { onStarted(await startJob(jobId, selectedRobotId)); }
    catch (error) { setError(error instanceof Error ? error.message : 'Start Job Failed'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={{ gap: 10 }}>
    <ChoiceField label="Robot" value={selectedRobotId} onChange={setSelectedRobotId} disabled={busy}
      options={eligible.map(r => ({ value: r.id, label: `${r.code} · ${r.batteryPercent == null ? 'No sensor' : `${r.batteryPercent}%`}` }))} />
    {!robots.loading && !robots.error && !eligible.length && <Text variant="caption">No Available Robot On This Map</Text>}
    <ErrorBanner message={robots.error ?? error} />
    <Button title="Start Job on Robot" loading={busy} disabled={!!robots.error || !eligible.some(r => r.id === selectedRobotId)} onPress={run} />
  </View>;
}

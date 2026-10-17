import React, { useRef, useState } from 'react';
import { OperationalScreen } from '../../app/shell/OperationalScreen';
import { listRobots, cancelRobotCommand } from '../../shared/api/fleetApi';
import { useRemoteData } from '../../shared/hooks/useRemoteData';
import { useRealtime } from '../../shared/realtime';
import { Button, Card, ErrorBanner, StatusPill, Text } from '../../shared/ui';
export function FleetRecallScreen() {
  const { resyncVersion, robotConnectivity } = useRealtime();
  const fleet = useRemoteData(() => listRobots(), [resyncVersion, robotConnectivity]);
  const lock = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { commandId: string; message: string; error: boolean }>>({});
  const cancel = async (id: string) => {
    const robot = fleet.data?.items.find(r => r.id === id);
    if (!robot?.currentCommandId || lock.current) return;
    lock.current = true;
    setBusy(id);
    const commandId = robot.currentCommandId;
    try {
      await cancelRobotCommand(robot.id, commandId);
      setResults(prev => ({ ...prev, [id]: { commandId, message: 'Cancel Requested (Awaiting Robot ACK)', error: false } }));
      await fleet.reload();
    } catch (error) { setResults(prev => ({ ...prev, [id]: { commandId, message: error instanceof Error ? error.message : 'Cancel Request Failed', error: true } })); }
    finally { lock.current = false; setBusy(null); }
  };
  return <OperationalScreen title="Cancel Active Navigation Command" loading={fleet.loading} error={fleet.error} onRefresh={fleet.reload}>
    <Text>This Sends A Navigation Cancel Request. Robot Acknowledgement Is Required; It Is Not An Emergency Stop Or A Return-To-Base Command.</Text>
    {fleet.data?.items.map(robot => {
      const result = results[robot.id];
      const pending = result && !result.error && result.commandId === robot.currentCommandId;
      return <Card key={robot.id} gap={12}>
        <Text variant="headline">{robot.code}</Text><StatusPill status={robot.status} />
        <Text variant="caption">{robot.currentCommandId ? `Active Command: ${robot.currentCommandId}` : 'No Active Command Reported'}</Text>
        {result?.error ? <ErrorBanner message={result.message} /> : result && <Text color="warningText">{result.message}</Text>}
        <Button title="Cancel Active Navigation Command" variant="danger" loading={busy === robot.id} disabled={!!busy || !!fleet.error || !robot.currentCommandId || !!pending} onPress={() => cancel(robot.id)} />
      </Card>;
    })}
    {!fleet.loading && !fleet.error && !fleet.data?.items.length && <Text>No Robots Reported</Text>}
  </OperationalScreen>;
}

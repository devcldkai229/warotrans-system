import React, { useState } from 'react';
import { OperationalScreen } from '../../app/shell/OperationalScreen';
import { realtimeClient, useRealtime } from '../../shared/realtime';
import { Button, Card, Text } from '../../shared/ui';
export function OfflineBannerHUD() {
  const { isConnected } = useRealtime();
  const [busy, setBusy] = useState(false);
  const retry = async () => { setBusy(true); try { await realtimeClient.restart(); } finally { setBusy(false); } };
  return <OperationalScreen title="Connection Status">
    <Card gap={16}>
      <Text variant="headline">{isConnected ? 'Live Updates Connected' : 'Live Updates Disconnected'}</Text>
      <Text>Offline Mutation Queuing And Background Sync Are Not Available. Failed Operations Must Be Retried After Connectivity Returns.</Text>
      <Button title="Reconnect Live Updates" loading={busy} onPress={retry} />
    </Card>
  </OperationalScreen>;
}

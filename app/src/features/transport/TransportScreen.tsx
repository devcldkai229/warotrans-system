import React from 'react';
import { OperationalScreen } from '../../app/shell/OperationalScreen';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { listTransportRequests } from '../../shared/api/transportApi';
import { useRemoteData } from '../../shared/hooks/useRemoteData';
import { useRealtime } from '../../shared/realtime';
import { Button, Card, Text } from '../../shared/ui';
import { TransportRequestCard } from './TransportRequestCard';
export function TransportScreen() {
  const { navigate } = useNavigation();
  const { lastTransportStatus, lastJobUpdate, resyncVersion } = useRealtime();
  const state = useRemoteData(() => listTransportRequests({ take: 30 }), [lastTransportStatus, lastJobUpdate, resyncVersion]);
  return <OperationalScreen title="Transport" back={false} loading={state.loading} error={state.error} onRefresh={state.reload}>
    <Button title="New Transport Request" onPress={() => navigate('transport_create')} />
    <Card gap={10}>
      <Button title="Receive A Container" variant="outline" onPress={() => navigate('create_container')} />
      <Button title="Inventory Lookup" variant="outline" onPress={() => navigate('inventory_lookup')} />
      <Button title="Transport History" variant="outline" onPress={() => navigate('transport_history')} />
      <Button title="Cancel Active Navigation Command" variant="outline" onPress={() => navigate('fleet_recall')} />
      <Button title="Path Hazard Capability" variant="ghost" onPress={() => navigate('block_path')} />
      <Button title="Payload Recovery Capability" variant="ghost" onPress={() => navigate('payload_recovery')} />
    </Card>
    <Text variant="headline">Recent Requests</Text>
    {state.data?.items.map(request => <TransportRequestCard key={request.id} request={request} onChanged={state.reload} />)}
    {!state.loading && !state.error && !state.data?.items.length && <Text>No Transport Requests</Text>}
  </OperationalScreen>;
}

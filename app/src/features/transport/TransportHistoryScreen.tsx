import React, { useState } from 'react';
import { OperationalScreen } from '../../app/shell/OperationalScreen';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { listTransportRequests } from '../../shared/api/transportApi';
import { useRemoteData } from '../../shared/hooks/useRemoteData';
import { useRealtime } from '../../shared/realtime';
import { ChoiceField, Text, TextField } from '../../shared/ui';
import { TransportRequestCard } from './TransportRequestCard';
export function TransportHistoryScreen() {
  const { params } = useNavigation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const { lastTransportStatus, lastJobUpdate, resyncVersion } = useRealtime();
  const state = useRemoteData(() => listTransportRequests({ search, status: status || undefined, take: 100 }), [search, status, lastTransportStatus, lastJobUpdate, resyncVersion]);
  const items = state.data?.items ?? [];
  const ordered = params.requestId ? [...items].sort((a,b) => Number(b.id === params.requestId) - Number(a.id === params.requestId)) : items;
  return <OperationalScreen title="Transport History" loading={state.loading} error={state.error} onRefresh={state.reload}>
    <TextField label="Search Requests" value={search} onChangeText={setSearch} />
    <ChoiceField label="Status" value={status} onChange={setStatus} options={['', 'SUBMITTED', 'QUEUED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED', 'COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED'].map(value => ({ value, label: value ? value.toLowerCase().replaceAll('_',' ') : 'All Statuses' }))} />
    <Text variant="caption">{state.data ? `${state.data.total} Requests Reported By Server` : 'Awaiting Server Data'}</Text>
    {ordered.map(request => <TransportRequestCard key={request.id} request={request} onChanged={state.reload} />)}
    {!state.loading && !state.error && !items.length && <Text>No Requests Found</Text>}
  </OperationalScreen>;
}

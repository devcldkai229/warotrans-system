import React, { useRef, useState } from 'react';
import { getTransportRequest, queueTransportRequest, TransportRequestListItem } from '../../shared/api/transportApi';
import { listJobs } from '../../shared/api/executionApi';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useRealtime } from '../../shared/realtime';
import { useRemoteData } from '../../shared/hooks/useRemoteData';
import { Button, Card, ErrorBanner, StatusPill, Text } from '../../shared/ui';
import { RobotStartControl } from '../jobs/RobotStartControl';

export function TransportRequestCard({ request, onChanged }: { request: TransportRequestListItem; onChanged: () => void }) {
  const { navigate } = useNavigation();
  const { lastJobUpdate, resyncVersion } = useRealtime();
  const jobs = useRemoteData(() => listJobs({ transportRequestId: request.id }), [request.id, request.status, lastJobUpdate, resyncVersion]);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const queue = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(null);
    try { await queueTransportRequest(request.id); setQueued(true); await jobs.reload(); onChanged(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Queue Failed'); }
    finally { lock.current = false; setBusy(false); }
  };
  const repeat = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(null);
    try { const detail = await getTransportRequest(request.id); navigate('transport_create', { repeatRequestId: detail.id }); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable To Load Request Details'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Card gap={12}>
    <Text variant="headline">{request.requestCode}</Text><StatusPill status={request.status} />
    <Text variant="caption">{new Date(request.submittedAt).toLocaleString()} · {request.detailCount} Movements</Text>
    {request.note && <Text>{request.note}</Text>}
    {request.details.map(detail => <Text key={detail.id}>{detail.containerBarcode ?? detail.containerId} · {detail.sourceEndpointCode ?? detail.sourceEndpointId} → {detail.destinationEndpointCode ?? detail.destinationEndpointId}</Text>)}
    <ErrorBanner message={error ?? jobs.error} />
    {request.status === 'SUBMITTED' && !queued && <Button title="Queue Request" loading={busy} onPress={queue} />}
    {jobs.data?.items.map(job => <Card key={job.id} gap={10}>
      <Text variant="headline">{job.jobNo}</Text><StatusPill status={job.status} />
      {(job.status === 'CREATED' || job.status === 'QUEUED') && <RobotStartControl jobId={job.id} mapVersionId={job.mapVersionId} onStarted={() => { void jobs.reload(); onChanged(); }} />}
      <Button title="View Job" variant="outline" onPress={() => navigate('job_detail', { jobId: job.id })} />
    </Card>)}
    {!jobs.loading && !jobs.error && !jobs.data?.items.length && <Text variant="caption">No Associated Jobs Reported</Text>}
    <Button title="Run Again" variant="outline" disabled={busy} onPress={repeat} />
  </Card>;
}

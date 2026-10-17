import React from 'react';
import { OperationalScreen } from '../../app/shell/OperationalScreen';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { listJobs } from '../../shared/api/executionApi';
import { useRemoteData } from '../../shared/hooks/useRemoteData';
import { useRealtime } from '../../shared/realtime';
import { Button, Card, Text } from '../../shared/ui';
export function PayloadRecoveryScreen() {
  const { navigate } = useNavigation();
  const { resyncVersion, lastJobUpdate } = useRealtime();
  const jobs = useRemoteData(() => listJobs({ status: 'RECOVERY_REQUIRED' }), [resyncVersion, lastJobUpdate]);
  return <OperationalScreen title="Payload Recovery" loading={jobs.loading} error={jobs.error} onRefresh={jobs.reload}>
    <Card gap={16}>
      <Text variant="headline">Operations Capability Unavailable</Text>
      <Text>The Server Does Not Provide A Payload Recovery Or Cargo Transfer Endpoint. Recovery Cannot Be Completed From This Screen.</Text>
      <Button title="Transfer Payload (Unavailable)" disabled onPress={() => {}} />
    </Card>
    {jobs.data?.items.map(job => <Button key={job.id} title={`${job.jobNo} · View Recovery Required Job`} variant="outline" onPress={() => navigate('job_detail', { jobId: job.id })} />)}
    {!jobs.loading && !jobs.error && !jobs.data?.items.length && <Text>No Jobs Require Recovery</Text>}
  </OperationalScreen>;
}

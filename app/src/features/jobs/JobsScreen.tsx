import React, { useEffect, useState } from 'react';
import { OperationalScreen } from '../../app/shell/OperationalScreen';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { listJobs } from '../../shared/api/executionApi';
import { useRemoteData } from '../../shared/hooks/useRemoteData';
import { useRealtime } from '../../shared/realtime';
import { Text, TextField, SegmentedControl } from '../../shared/ui';
import { JobCard } from './JobCard';
import { isTerminalJobStatus } from './jobData';
export function JobsScreen() {
  const { navigate, setActiveJobCount, params } = useNavigation();
  const { lastJobUpdate, resyncVersion } = useRealtime();
  const [scope, setScope] = useState(params.view === 'history' ? 'history' : 'active');
  const [query, setQuery] = useState('');
  const state = useRemoteData(() => listJobs({ take: 100 }), [lastJobUpdate, resyncVersion]);
  useEffect(() => { setActiveJobCount(state.data?.items.filter(j => !isTerminalJobStatus(j.status)).length ?? 0); }, [state.data, setActiveJobCount]);
  const visible = state.data?.items.filter(j => (scope === 'history') === isTerminalJobStatus(j.status)
    && `${j.jobNo} ${j.id} ${j.status}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  return <OperationalScreen title="Job Execution" back={false} loading={state.loading} error={state.error} onRefresh={state.reload}>
    <SegmentedControl value={scope} options={[{ label: 'Active Jobs', value: 'active' }, { label: 'History', value: 'history' }]} onChange={setScope} />
    <TextField label="Search Jobs" value={query} onChangeText={setQuery} />
    <Text variant="caption">{state.data ? `${state.data.total} Jobs Reported By Server` : 'Awaiting Server Data'}</Text>
    {visible.map(job => <JobCard key={job.id} job={job} onChanged={state.reload} onPress={() => navigate('job_detail', { jobId: job.id })} />)}
    {!state.loading && !state.error && !visible.length && <Text>No Jobs Found</Text>}
  </OperationalScreen>;
}

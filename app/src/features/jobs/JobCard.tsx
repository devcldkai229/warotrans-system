import React from 'react';
import type { JobSummaryDto } from '../../shared/types/contracts';
import { Button, Card, Text, StatusPill, ProgressMeter } from '../../shared/ui';
import { RobotStartControl } from './RobotStartControl';
export function JobCard({ job, onPress, onChanged }: { job: JobSummaryDto; onPress: () => void; onChanged: () => void }) {
  return <Card gap={12}>
    <Text variant="headline">{job.jobNo}</Text><StatusPill status={job.status} />
    <Text variant="caption">{job.containerCount} Containers · {job.completedSteps}/{job.totalSteps} Steps</Text>
    <ProgressMeter value={job.totalSteps ? 100 * job.completedSteps / job.totalSteps : 0} />
    {job.failureCode && <Text color="dangerText">{job.failureCode}</Text>}
    {(job.status === 'CREATED' || job.status === 'QUEUED') && <RobotStartControl jobId={job.id} mapVersionId={job.mapVersionId} onStarted={onChanged} />}
    <Button title={job.status === 'RUNNING' ? 'View Execution & Handover' : 'View Job'} variant="outline" onPress={onPress} />
  </Card>;
}

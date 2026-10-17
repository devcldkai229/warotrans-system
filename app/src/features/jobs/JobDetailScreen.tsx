import React, { useRef, useState } from 'react';
import { OperationalScreen } from '../../app/shell/OperationalScreen';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { getJobDetail } from '../../shared/api/executionApi';
import { cancelRobotCommand, getRobot } from '../../shared/api/fleetApi';
import { getContainer } from '../../shared/api/warehouseApi';
import { useRemoteData } from '../../shared/hooks/useRemoteData';
import { useRealtime } from '../../shared/realtime';
import { Button, Card, ErrorBanner, Text, StatusPill } from '../../shared/ui';
import { getCurrentStep, canConfirmHandover } from './jobData';
import { RobotStartControl } from './RobotStartControl';
import { JobStepper } from './JobStepper';
import { AmrCargoBayVisualizer } from './AmrCargoBayVisualizer';
import { VerifyModal } from './VerifyModal';
import { IssueReportingModal } from '../monitoring/IssueReportingModal';

export function JobDetailScreen() {
  const { params, navigate } = useNavigation();
  const { lastJobUpdate, resyncVersion, robotConnectivity } = useRealtime();
  const id = typeof params.jobId === 'string' ? params.jobId : '';
  const state = useRemoteData(async () => { if (!id) throw new Error('Select A Job From The Jobs Screen.'); return getJobDetail(id); }, [id, lastJobUpdate, resyncVersion]);
  const job = state.data;
  const inventory = useRemoteData(async () => job ? Promise.all(job.containers.map(c => getContainer(c.containerId))) : [], [job?.id, job?.containers]);
  const robot = useRemoteData(async () => job?.assignedRobotId ? getRobot(job.assignedRobotId) : null, [job?.assignedRobotId, resyncVersion, robotConnectivity]);
  const [verify, setVerify] = useState(false);
  const [issue, setIssue] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelRequested, setCancelRequested] = useState<string | null>(null);
  const cancelLock = useRef(false);
  const currentStep = job && getCurrentStep(job);
  const cancel = async () => {
    if (!robot.data?.currentCommandId || cancelLock.current) return;
    cancelLock.current = true;
    setBusy(true); setActionError(null);
    try { await cancelRobotCommand(robot.data.id, robot.data.currentCommandId); setCancelRequested(robot.data.currentCommandId); await robot.reload(); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Cancel Request Failed'); }
    finally { cancelLock.current = false; setBusy(false); }
  };
  return <OperationalScreen title={job?.jobNo ?? 'Job Detail'} error={state.error} loading={state.loading} onRefresh={state.reload}>
    {job && <>
      <Card gap={10}><StatusPill status={job.status} /><Text variant="caption">{job.completedSteps}/{job.totalSteps} Steps Complete</Text>
        <Text>Robot: {robot.data?.code ?? job.assignedRobotId ?? 'Unassigned'}</Text>
        {!!job.failureMessage && <ErrorBanner message={job.failureMessage} />}
      </Card>
      {(job.status === 'CREATED' || job.status === 'QUEUED') && !state.error && <RobotStartControl key={job.id} jobId={job.id} mapVersionId={job.mapVersionId} onStarted={state.setData} />}
      {currentStep && <Card gap={12}>
        <Text variant="headline">Current Step: {currentStep.name}</Text><StatusPill status={currentStep.status} />
        <Text variant="code">{currentStep.operationCode}</Text>
        {canConfirmHandover(job, currentStep) && <Button title="Handover Confirmation" disabled={!!state.error || state.loading} onPress={() => setVerify(true)} />}
      </Card>}
      <ErrorBanner message={inventory.error} />
      <AmrCargoBayVisualizer containers={job.containers} inventory={inventory.data} />
      <JobStepper steps={[...job.tasks].sort((a,b) => a.sequenceNo-b.sequenceNo).flatMap(t => [...t.steps].sort((a,b) => a.sequenceNo-b.sequenceNo))} currentStepId={currentStep?.id} />
      <Button title="View Live Map" variant="outline" onPress={() => navigate('live_map', { jobId: job.id, mapVersionId: job.mapVersionId })} />
      <Button title="Report An Issue" variant="outline" onPress={() => setIssue(true)} />
      <ErrorBanner message={actionError ?? robot.error} />
      {cancelRequested && <Text color="warningText">Cancel Requested (Awaiting Robot ACK). This Is Not An Emergency Stop.</Text>}
      <Button title="Cancel Active Navigation Command" variant="danger" loading={busy} disabled={!robot.data?.currentCommandId || cancelRequested === robot.data?.currentCommandId} onPress={cancel} />
      {!robot.data?.currentCommandId && <Text variant="caption">No Active Robot Command Reported</Text>}
      {currentStep && <VerifyModal key={currentStep.id} visible={verify && canConfirmHandover(job, currentStep)} onClose={() => setVerify(false)}
        stepId={currentStep.id} operationCode={currentStep.operationCode}
        expectedContainerId={typeof currentStep.resolvedInputs.containerId === 'string' ? currentStep.resolvedInputs.containerId : undefined}
        onConfirmed={state.setData} />}
    </>}
    <IssueReportingModal visible={issue} onClose={() => setIssue(false)} jobId={job?.id} />
  </OperationalScreen>;
}

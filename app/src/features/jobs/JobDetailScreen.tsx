import { useAuth } from '../auth/authContext';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BatteryCharging,
  CheckCircle2,
  Clock3,
  Layers,
  Lock,
  MapPin,
  Maximize2,
  MoreVertical,
  Navigation,
  PauseCircle,
  RefreshCw,
  SlidersHorizontal,
  Truck,
  UserMinus,
  X,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { ThemeShadows } from '../../shared/theme/shadows';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { typography } from '../../shared/theme/typography';
import { dockReservedSpace, useTopInset } from '../../shared/theme/layout';
import { toast } from '../../shared/context/ToastContext';
import { useSafetyHold } from '../../shared/context/SafetyHoldContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import { Button, Card, ProgressMeter, ReasonSheet, StatusPill, Text } from '../../shared/ui';
import { AmrCargoBayVisualizer } from './AmrCargoBayVisualizer';
import { JobContainersCard, JobOverviewCard, JobStepsAccordion, ReportProblemCard } from './JobDetailParts';
import { usePlaceDirectory } from '../../shared/places/usePlaceDirectory';
import { useQuery } from '@tanstack/react-query';
import { JobTaskDetailSheet } from './JobTaskDetailSheet';
import {
  AppJobItem,
  EMPTY_JOB,
  isStopStateInFlight,
  isTerminalJobStatus,
  isUncertainCommandError,
  JOB_STATUS_PRESENTATION,
  mapJobDetailToAppJobItem,
  stopStatePresentation,
  submitIssueAndOptionalPause,
} from './jobData';
import { VerifyModal } from './VerifyModal';
import { HandoverActionsCard } from './HandoverActionsCard';
import { PERMISSIONS, sessionCan } from '../../shared/auth/permissions';
import { IncidentCategory, IssueReportingModal, type IssueSubmitInput } from '../monitoring/IssueReportingModal';
import {
  cancelRobotCommand,
  getJobAction,
  getJobDetail,
  getRobot,
  getRobotStopState,
  getUserErrorMessage,
  isJobActionAllowed,
  mobileCapabilities,
  pauseJob,
  reportTaskProblem,
  resumeJob,
  startJob,
} from '../../shared/api';
import { localizeServerMessage, t } from '../../shared/i18n';
import type { JobDetailResponse } from '../../shared/types/contracts';
import { useRealtime } from '../../shared/realtime/RealtimeContext';
import { createJobRefresh } from './jobRefresh';

export function JobDetailScreen() {
  const { styles, colors } = useThemedStyles(createStyles);
  const { navigate, goBack, params } = useNavigation();
  const topInset = useTopInset();
  const { session } = useAuth();
  const [isLoadingJob, setIsLoadingJob] = useState(true);
  const [jobError, setJobError] = useState<string | null>(null);
  const [jobRefreshError, setJobRefreshError] = useState<string | null>(null);
  const { lastJobUpdate, lastTrafficUpdate, robotTelemetry, robotConnectivity } = useRealtime();
  const places = usePlaceDirectory();

  const initialModal = params?.modal;
  const isInitialVerify =
    initialModal === 'verify' || initialModal === 'handover' || initialModal === 'mismatch';
  const isInitialMismatch = initialModal === 'mismatch';
  const isInitialIssue = initialModal === 'issue' || initialModal === 'exception';

  const [isVerifyOpen, setIsVerifyOpen] = useState(isInitialVerify);
  const [verificationStepId, setVerificationStepId] = useState<string | null>(null);
  const [isMismatch, setIsMismatch] = useState(isInitialMismatch);
  const [isIssueOpen, setIsIssueOpen] = useState(isInitialIssue);
  const [showMenu, setShowMenu] = useState(false);
  const [showFullJobNo, setShowFullJobNo] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showOtherContainers, setShowOtherContainers] = useState(false);
  const [showNudgeControls, setShowNudgeControls] = useState(false);
  const [isStartingJob, setIsStartingJob] = useState(false);
  const [pauseSheetOpen, setPauseSheetOpen] = useState(false);
  const [pauseNotice, setPauseNotice] = useState<string | null>(null);
  const [bottomConsoleHeight, setBottomConsoleHeight] = useState(160);

  /** Shared safety hold context */
  const { isHolding, toggleHold } = useSafetyHold();

  const jobId = params?.jobId || '';
  const [job, setJob] = useState<AppJobItem>(EMPTY_JOB);
  const [jobReader] = useState(() => createJobRefresh<JobDetailResponse>());
  const activeJobId = useRef(jobId);
  activeJobId.current = jobId;
  const refreshJob = useCallback(() => jobReader.read(jobId, () => getJobDetail(jobId), detail => {
      if (activeJobId.current === jobId) {
        setJob(mapJobDetailToAppJobItem(detail, session?.id));
        setJobError(null); setJobRefreshError(null);
      }
    }, error => {
      if (activeJobId.current === jobId) {
        setJobRefreshError(error instanceof Error ? error.message : 'Job could not be refreshed.');
      }
    }), [jobId, session?.id, jobReader]);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingJob(true); setJobError(null); setJobRefreshError(null); setJob(EMPTY_JOB);
    setSelectedTaskId(null); setShowFullJobNo(false); setVerificationStepId(null);
    setPauseSheetOpen(false); setPauseNotice(null);
    setIsVerifyOpen(isInitialVerify); setIsIssueOpen(isInitialIssue);
    if (!jobId) { setJobError('No job was selected.'); setIsLoadingJob(false); return; }
    const initialRequestVersion = jobReader.version + 1;
    refreshJob()
      .catch((err) => {
        if (isMounted && initialRequestVersion === jobReader.version) setJobError(err.message || 'Job could not be loaded.');
      })
    .finally(() => { if (isMounted) setIsLoadingJob(false); });
    const poll = setInterval(() => { void refreshJob().catch(() => {}); }, 5000);
    return () => { isMounted = false; clearInterval(poll); jobReader.invalidate(); };
  }, [jobId, refreshJob]);

  useEffect(() => {
    if (
      lastJobUpdate &&
      (lastJobUpdate.jobId === jobId ||
        lastJobUpdate.jobNo === jobId ||
        lastJobUpdate.jobId === job.id ||
        lastJobUpdate.jobNo === job.jobNo)
    ) {
      refreshJob()
        .catch((err) => {
          console.warn('Failed to refetch job detail on realtime jobUpdated:', err);
        });
    }
  }, [lastJobUpdate, jobId, job.id, job.jobNo, refreshJob]);

  // A traffic grant / wait / release for this job (trafficUpdated): its waiting reason and progress changed.
  useEffect(() => {
    if (lastTrafficUpdate?.jobId && (lastTrafficUpdate.jobId === jobId || lastTrafficUpdate.jobId === job.id)) {
      refreshJob().catch(() => {});
    }
  }, [lastTrafficUpdate, jobId, job.id, refreshJob]);

  useEffect(() => {
    if (isVerifyOpen && !verificationStepId && job.activeStepId) setVerificationStepId(job.activeStepId);
  }, [isVerifyOpen, verificationStepId, job.activeStepId]);

  const targetContainers =
    job.containers?.filter((c) => c.action === 'UNLOAD' || c.action === 'PICKUP') || [];
  const otherContainers =
    job.containers?.filter((c) => c.action !== 'UNLOAD' && c.action !== 'PICKUP') || [];
  const primaryTarget = job.containers?.find((c) => c.isTarget) || targetContainers[0] || job.containers?.[0];

  const [targetContainer, setTargetContainer] = useState(primaryTarget?.code || '');

  const isWaiting = Boolean(job.hasWaitingHandover);
  const isQueuedOrCreated = job.status === 'CREATED' || job.status === 'QUEUED';
  const isEnRoute = job.status === 'RUNNING' && !isWaiting;
  const isCompleted = job.status === 'COMPLETED';
  const selectedRobotUuid = job.assignedRobotId;
  const assignedRobotLabel = job.assignedRobotId && (!job.robot || job.robot === 'Unassigned')
    ? job.assignedRobotId : job.robot || 'Awaiting Robot Assignment';
  const selectedTask = job.tasks.find(task => task.id === selectedTaskId);
  const verificationTask = job.tasks.find(task => task.steps.some(step => step.id === verificationStepId));
  const verificationStep = verificationTask?.steps.find(step => step.id === verificationStepId);
  const verificationContainerId = verificationStep?.resolvedInputs?.containerId || verificationTask?.contextValues?.containerId;
  const verificationContainer = job.containers.find(container => container.containerId === verificationContainerId);
  const activeTask = job.tasks.find(task => task.steps.some(step => step.id === job.activeStepId));
  const activeStep = activeTask?.steps.find(step => step.id === job.activeStepId);
  const activeContainerRaw = activeStep?.resolvedInputs?.containerId || activeTask?.contextValues?.containerId;
  const activeContainerId = typeof activeContainerRaw === 'string' ? activeContainerRaw : undefined;
  const activeContainer = job.containers.find(container => container.containerId === activeContainerId);

  useEffect(() => {
    setTargetContainer(primaryTarget?.code || '');
  }, [job.id, primaryTarget?.code]);

  const handleStartJob = async () => {
    if (isStartingJob) return;
    setIsStartingJob(true);
    try {
      const updated = await startJob(job.id);
      if (!updated) throw new Error('Job could not be started');
      if (activeJobId.current !== job.id) return;
      jobReader.invalidate();
      const started = mapJobDetailToAppJobItem(updated, session?.id);
      setJob(started);
      const assigned = started.robot && started.robot !== 'Unassigned' ? started.robot : started.assignedRobotId;
      toast.success(`Job ${started.jobNo || started.id} started${assigned ? ` on ${assigned}` : ''}.`);
    } catch (err: any) {
      if (activeJobId.current === job.id) toast.error(err?.message || 'Failed to start job');
    } finally {
      setIsStartingJob(false);
    }
  };

  // The robot: name and last known state from the API, speed / battery / online from the live hub when it reports.
  const robotQuery = useQuery({
    queryKey: ['job-robot', job.assignedRobotId],
    queryFn: () => getRobot(job.assignedRobotId!),
    enabled: !!job.assignedRobotId,
    refetchInterval: 15_000,
  });
  const stopStateQuery = useQuery({
    queryKey: ['robot-stop-state', job.assignedRobotId],
    queryFn: ({ signal }) => getRobotStopState(job.assignedRobotId!, signal),
    enabled: Boolean(job.assignedRobotId && (job.status === 'PAUSED' || pauseNotice)),
    refetchInterval: q => isStopStateInFlight(q.state.data?.state) ? 2_000 : job.status === 'PAUSED' ? 5_000 : false,
    retry: false,
  });
  const startAction = getJobAction(job, 'START');
  const resumeAction = getJobAction(job, 'RESUME');
  const canStart = sessionCan(session, PERMISSIONS.jobOperate) && isJobActionAllowed(job, 'START', true);
  const canPause = mobileCapabilities.pauseJob && sessionCan(session, PERMISSIONS.jobPause) && isJobActionAllowed(job, 'PAUSE', job.status === 'RUNNING');
  const canResume = sessionCan(session, PERMISSIONS.jobOperate) && isJobActionAllowed(job, 'RESUME', true);
  const actionReasonText = (code?: string | null) => code ? localizeServerMessage(code, code.replace(/_/g, ' ')) : null;
  const robotCode = robotQuery.data?.code ?? (job.robot !== 'Unassigned' ? job.robot : undefined);
  const live = robotCode ? robotTelemetry[robotCode] : undefined;
  const connectivity = robotCode ? robotConnectivity[robotCode] : undefined;
  const liveOnline = connectivity ? connectivity.isOnline : robotQuery.data ? robotQuery.data.isOnline : null;
  const liveSpeed = typeof live?.linearVelocity === 'number' ? live.linearVelocity
    : typeof robotQuery.data?.linearVelocity === 'number' ? robotQuery.data.linearVelocity : null;
  const liveBattery = typeof live?.batteryPercent === 'number' ? live.batteryPercent : robotQuery.data?.batteryPercent ?? null;

  const handlePauseJob = async (reason: string) => {
    try {
      const updated = await pauseJob(job.id, reason);
      if (activeJobId.current !== job.id) return;
      jobReader.invalidate();
      setJob(mapJobDetailToAppJobItem(updated, session?.id));
      setPauseSheetOpen(false);
      setPauseNotice(null);
      void stopStateQuery.refetch();
      toast.success('Job paused. Checking robot stop state.');
    } catch (error: unknown) {
      if (activeJobId.current === job.id && isUncertainCommandError(error)) {
        setPauseNotice(t('The pause result could not be confirmed. Refresh the job and robot stop state before retrying.'));
        void refreshJob().catch(() => {});
        void stopStateQuery.refetch();
      }
      throw new Error(getUserErrorMessage(error, 'Job could not be paused.'));
    }
  };
  const handleResumeJob = async () => {
    if (isStartingJob) return;
    setIsStartingJob(true);
    try {
      const updated = await resumeJob(job.id);
      if (activeJobId.current !== job.id) return;
      jobReader.invalidate();
      setJob(mapJobDetailToAppJobItem(updated, session?.id));
      setPauseNotice(null);
      void stopStateQuery.refetch();
      toast.success('Job resumed.');
    } catch (error: unknown) {
      if (activeJobId.current === job.id) toast.error(getUserErrorMessage(error, 'Job could not be resumed.'));
    } finally { setIsStartingJob(false); }
  };

  const handleOpenVerify = (containerCode?: string) => {
    triggerHaptic('tap');
    if (!job.activeStepId || !isWaiting) return;
    setVerificationStepId(job.activeStepId);
    if (containerCode) setTargetContainer(containerCode);
    setIsVerifyOpen(true);
  };

  const handleVerifySuccess = (scannedCode: string, updatedJob?: JobDetailResponse | null) => {
    setIsVerifyOpen(false);
    if (updatedJob) { jobReader.invalidate(); setJob(mapJobDetailToAppJobItem(updatedJob, session?.id)); }
    void refreshJob().catch(() => {});
    toast.success(`Handover verified for ${scannedCode}.`);
  };

  const handleIssueSubmit = async (input: IssueSubmitInput) => {
    const description = input.notes.trim() || `Staff reported ${input.category} on job ${job.jobNo}`;
    const outcome = await submitIssueAndOptionalPause({
      existingIssue: input.existingIssue,
      createIssue: () => reportTaskProblem(
        job.activeTaskId,
        { reason: input.category, note: description },
        job.activeStepId,
        { jobId: job.id, containerId: activeContainerId, robotId: job.assignedRobotId },
      ),
      pauseJob: input.pauseJob ? () => pauseJob(job.id, description.slice(0, 500)) : undefined,
    });
    if (outcome.pausedJob && activeJobId.current === job.id) {
      jobReader.invalidate();
      setJob(mapJobDetailToAppJobItem(outcome.pausedJob, session?.id));
      setPauseNotice(null);
      void stopStateQuery.refetch();
      toast.success(t('Issue {code} recorded and job paused.', { code: outcome.issue.code }));
    } else if (outcome.pauseError && outcome.pauseUncertain && activeJobId.current === job.id) {
      setPauseNotice(t('The pause result could not be confirmed. Refresh the job and robot stop state before retrying.'));
      void refreshJob().catch(() => {});
      void stopStateQuery.refetch();
    } else if (!outcome.pauseError) {
      toast.success(t('Issue {code} recorded. Robot state has not been changed.', { code: outcome.issue.code }));
    }
    return outcome;
  };

  if (isLoadingJob || jobError || !job.id) return <View style={styles.root}>
    <SubScreenHeader title="Job Details" onBack={goBack} />
    <View style={{ padding: 24, gap: 16 }}>
      <Text variant="headline">{isLoadingJob ? 'Loading Job…' : 'Job Unavailable'}</Text>
      {jobError && <Text variant="body" color={colors.danger}>{jobError}</Text>}
      <Button title="Back To Jobs" onPress={() => navigate('jobs')} />
    </View>
  </View>;

  return (
    <View style={styles.root}>
      {/* Top Navigation Bar */}
      <View style={[styles.header, { paddingTop: topInset + 8 }]} onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.headerBtn, pressed && styles.btnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Back to jobs"
        >
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>

        <View style={styles.headerTitleCol}>
          <Pressable
            onPress={() => setShowFullJobNo(value => !value)}
            accessibilityRole="button"
            accessibilityLabel={`Job ${job.jobNo || job.id}`}
            accessibilityHint="Tap to show or collapse the full job number"
            accessibilityState={{ expanded: showFullJobNo }}
            style={styles.headerTitleTarget}
          >
            <Text variant="headline" style={styles.jobIdText} numberOfLines={showFullJobNo ? undefined : 1} ellipsizeMode="middle">
              {job.jobNo || job.id}
            </Text>
          </Pressable>
          <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
            {job.workflowName}
          </Text>
        </View>

        <Pressable
          onPress={() => setShowMenu((prev) => !prev)}
          style={({ pressed }) => [styles.headerBtn, pressed && styles.btnPressed]}
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <MoreVertical size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Context Menu Dropdown */}
      {showMenu && (
        <>
          <Pressable style={styles.menuDismiss} onPress={() => setShowMenu(false)} />
          <View style={[styles.menuDropdown, { top: headerHeight + 4 }]}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigate('live_map', { jobId: job.id, robotId: job.robot });
              }}
            >
              <Maximize2 size={16} color={colors.primary} />
              <Text variant="body" style={styles.menuItemText}>
                View on map
              </Text>
            </Pressable>

            {canPause ? <Pressable
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                setPauseSheetOpen(true);
              }}
            >
              <PauseCircle size={16} color={colors.warningText} />
              <Text variant="body" color={colors.warningText} style={styles.menuItemText}>
                Pause Job
              </Text>
            </Pressable> : null}

            {!isTerminalJobStatus(job.status) ? <Pressable
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                setIsIssueOpen(true);
              }}
            >
              <AlertTriangle size={16} color={colors.danger} />
              <Text variant="body" color={colors.danger} style={styles.menuItemText}>
                Report a problem
              </Text>
            </Pressable> : null}
          </View>
        </>
      )}

      {/* Main Content Body */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: dockReservedSpace(bottomConsoleHeight) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {jobRefreshError ? <View style={styles.refreshWarning} accessibilityLiveRegion="polite">
          <Text variant="body" color={colors.warningText}>Could not refresh this job. Showing the last loaded status.</Text>
          <Text variant="caption" color={colors.warningText}>{jobRefreshError}</Text>
          <Button title="Retry Refresh" variant="outline" size="sm" onPress={() => { void refreshJob().catch(() => {}); }} />
        </View> : null}
        <JobOverviewCard
          job={job}
          places={places}
          robotName={robotQuery.data?.name ?? null}
          online={liveOnline}
          speed={liveSpeed}
          battery={liveBattery}
          charging={robotQuery.data?.status === 'CHARGING'}
          onOpenMap={() => navigate('live_map', { jobId: job.id, robotId: job.robot })}
        />

        {(job.status === 'PAUSED' || Boolean(pauseNotice)) && (() => {
          const stopState = stopStateQuery.data;
          const stopMeta = stopStatePresentation(stopState?.state);
          const pauseTime = job.operatorPause?.pausedAt
            ? new Date(job.operatorPause.pausedAt).toLocaleString()
            : null;
          return (
            <Card padding="md" gap={10}>
              <View style={styles.cardHeaderRow}>
                <Text variant="headline">
                  {job.operatorPause
                    ? t('Paused By Operator')
                    : job.status === 'PAUSED'
                      ? t('Job Paused')
                      : t('Pause Status Unverified')}
                </Text>
                <StatusPill status={job.status} size="sm" dot />
              </View>
              {job.operatorPause ? (
                <View style={{ gap: 4 }}>
                  <Text variant="caption" color={colors.textSecondary}>
                    {job.operatorPause.pausedBy === session?.id ? t('Paused by you') : t('Paused by another operator')}
                    {pauseTime ? ` · ${pauseTime}` : ''}
                  </Text>
                  <Text variant="body" color={colors.textPrimary}>
                    {t('Reason: {reason}', { reason: job.operatorPause.reason || '—' })}
                  </Text>
                </View>
              ) : job.status === 'PAUSED' ? (
                <Text variant="body" color={colors.textSecondary}>
                  {job.failureMessage || job.failureCode || t('Execution paused by system or workflow policy.')}
                </Text>
              ) : null}
              {pauseNotice ? (
                <View style={styles.refreshWarning}>
                  <Text variant="caption" color={colors.warningText}>{pauseNotice}</Text>
                  <Button
                    title="Refresh Job & Stop State"
                    variant="outline"
                    size="sm"
                    onPress={() => {
                      setPauseNotice(null);
                      void refreshJob().catch(() => {});
                      if (job.assignedRobotId) void stopStateQuery.refetch();
                    }}
                  />
                </View>
              ) : null}
              {job.assignedRobotId ? (
                <View style={styles.stopStateBox}>
                  <View style={styles.cardHeaderRow}>
                    <Text variant="label" color={colors.textSecondary}>Robot Stop State</Text>
                    {stopStateQuery.data ? (
                      <StatusPill
                        status={stopState!.state}
                        label={t(stopMeta.label)}
                        tone={stopMeta.tone}
                        size="sm"
                        dot
                      />
                    ) : null}
                  </View>
                  {stopStateQuery.isError ? (
                    <View style={{ gap: 8 }}>
                      <Text variant="caption" color={colors.dangerText}>Could not load robot stop state.</Text>
                      <Button title="Retry" variant="outline" size="sm" onPress={() => { void stopStateQuery.refetch(); }} />
                    </View>
                  ) : stopState ? (
                    <>
                      {stopState.state !== 'STOPPED_VERIFIED' ? (
                        <Text variant="caption" color={colors.warningText}>
                          Job PAUSED does not prove the robot has physically stopped.
                        </Text>
                      ) : null}
                      {stopState.errorCode ? (
                        <Text variant="caption" color={colors.dangerText}>
                          {t('Stop error: {code}', { code: stopState.errorCode })}
                        </Text>
                      ) : null}
                      {(isStopStateInFlight(stopState.state) || stopState.state === 'UNKNOWN' || stopState.state === 'REJECTED') ? (
                        <Button
                          title="Refresh Stop State"
                          variant="outline"
                          size="sm"
                          loading={stopStateQuery.isFetching}
                          onPress={() => { void stopStateQuery.refetch(); }}
                        />
                      ) : null}
                    </>
                  ) : (
                    <Text variant="caption" color={colors.textSecondary}>Loading…</Text>
                  )}
                </View>
              ) : null}
            </Card>
          );
        })()}

        {/* Primary Handover Focus Card (When waiting at station) */}
        {isWaiting && primaryTarget && (
          <Card padding="md" gap={12} style={styles.focusCard}>
            <View style={styles.focusHeader}>
              <View style={styles.focusTargetPill}>
                <Text variant="caption" style={styles.focusTargetPillText}>
                  Action Required · Handover
                </Text>
              </View>
              <Text variant="caption" color={colors.textSecondary} style={{ fontWeight: '600' }}>
                1 Container
              </Text>
            </View>

            <View style={styles.focusBody}>
              <Text variant="caption" color={colors.textSecondary} style={styles.focusLabel}>
                {job.activeStepOperation === 'PICKUP_CONFIRM' || primaryTarget.action === 'PICKUP'
                  ? 'Container to Load (Pickup)' : 'Container to Unload (Dropoff)'}
              </Text>
              <Text variant="title" style={styles.focusBarcode}>
                {primaryTarget.code}
              </Text>
              <Text variant="bodyMedium" color={colors.textSecondary} style={{ marginTop: 2 }}>
                <Text style={styles.boldQty}>{primaryTarget.qty} Container</Text> · {primaryTarget.product}
              </Text>
              <View style={styles.focusDestinationRow}>
                <Text variant="caption" color={colors.textSecondary}>
                  At:
                </Text>
                <Text variant="caption" color={colors.textPrimary} style={{ fontWeight: '700' }}>
                  {places.name(activeTask?.endpointCode, places.name(job.destinationEndpointCode))}
                </Text>
              </View>
            </View>

            {/* Other containers onboard accordion */}
            {otherContainers.length > 0 && (
              <View style={styles.otherContainersSection}>
                <Pressable
                  onPress={() => {
                    triggerHaptic('tap');
                    setShowOtherContainers((prev) => !prev);
                  }}
                  style={styles.otherContainersHeader}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle other containers"
                >
                  <View style={styles.otherContainersLeft}>
                    <Lock size={13} color={colors.textMuted} />
                    <Text variant="caption" color={colors.textSecondary} style={{ fontWeight: '600' }}>
                      {otherContainers.length} Other {otherContainers.length === 1 ? 'Tote' : 'Totes'} Remaining Onboard
                    </Text>
                  </View>
                  <Text variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>
                    {showOtherContainers ? 'Hide ▲' : 'Show ▼'}
                  </Text>
                </Pressable>

                {showOtherContainers && (
                  <View style={styles.otherContainersList}>
                    {otherContainers.map((item) => (
                      <View key={item.code} style={styles.otherContainerItem}>
                        <View style={{ flex: 1 }}>
                          <Text variant="caption" color={colors.textPrimary} style={styles.otherContainerCode}>
                            {item.code}
                          </Text>
                          <Text variant="caption" color={colors.textSecondary}>
                            <Text style={styles.boldQty}>{item.qty} Container</Text> · {item.product}
                          </Text>
                        </View>
                        <View style={styles.keepTag}>
                          <Lock size={10} color={colors.textMuted} style={{ marginRight: 3 }} />
                          <Text variant="caption" color={colors.textMuted} style={{ fontSize: 11, fontWeight: '600' }}>
                            Keep
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </Card>
        )}

        {/* Web parity: claim / give back / take over, confirm without scanning, confirm the whole stop at once. */}
        {isWaiting && activeStep ? (
          <HandoverActionsCard
            key={activeStep.id}
            jobId={job.id}
            step={activeStep}
            tasks={job.tasks}
            containerId={activeContainerId}
            containerCode={activeContainer?.code || primaryTarget?.code || activeContainerId || 'Container'}
            containerLabel={id => job.containers.find(container => container.containerId === id)?.code || id}
            accountId={session?.id}
            canOperate={sessionCan(session, PERMISSIONS.jobOperate)}
            canTakeOver={sessionCan(session, PERMISSIONS.jobTakeover)}
            onUpdated={detail => {
              if (activeJobId.current !== job.id) return;
              jobReader.invalidate();
              setJob(mapJobDetailToAppJobItem(detail, session?.id));
              void refreshJob().catch(() => {});
            }}
          />
        ) : null}

        <JobContainersCard
          containers={job.containers}
          places={places}
          from={places.name(job.sourceEndpointCode, 'Pick-up')}
          to={places.name(job.destinationEndpointCode, 'Drop-off')}
          tasks={job.tasks}
        />

        <JobStepsAccordion key={job.id} tasks={job.tasks} places={places} activeStepId={job.activeStepId} />

        {!isTerminalJobStatus(job.status) ? <ReportProblemCard onPress={() => setIsIssueOpen(true)} /> : null}
      </ScrollView>

      {/* Sticky Bottom Action Console */}
      <View style={styles.bottomConsole} onLayout={(event) => setBottomConsoleHeight(event.nativeEvent.layout.height)}>
        {/* Tier 2 Commanding Action Button (Machined Obsidian #121317) */}
        {isQueuedOrCreated && <Text variant="caption" color={!canStart && startAction?.reason ? colors.warningText : colors.textSecondary}>
          {!canStart && startAction?.reason
            ? actionReasonText(startAction.reason)
            : t('The system assigns an available robot when you start this Job.')}
        </Text>}
        {(job.status === 'PAUSED' || job.status === 'REASSIGNING') && !canResume && resumeAction?.reason ? (
          <Text variant="caption" color={colors.warningText}>{actionReasonText(resumeAction.reason)}</Text>
        ) : null}
        {canPause && (isWaiting || isEnRoute) ? (
          <Button
            title="Pause Job"
            variant="outline"
            size="md"
            fullWidth
            icon={PauseCircle}
            onPress={() => setPauseSheetOpen(true)}
          />
        ) : null}
        <View style={styles.consoleCtaRow}>
          {isQueuedOrCreated ? (
            <Button
              title="Start Job"
              variant="primary"
              size="lg"
              fullWidth
              loading={isStartingJob}
              disabled={!canStart || isStartingJob}
              onPress={handleStartJob}
            />
          ) : job.status === 'PAUSED' || job.status === 'REASSIGNING' ? (
            <Button
              title="Resume Job"
              variant="primary"
              size="lg"
              fullWidth
              loading={isStartingJob}
              disabled={!canResume || isStartingJob}
              onPress={handleResumeJob}
              icon={RefreshCw}
            />
          ) : job.status === 'RECOVERY_REQUIRED' ? (
            <Button
              title="Initiate Cargo Rescue"
              variant="danger"
              size="lg"
              fullWidth
              icon={AlertTriangle}
              iconPosition="right"
              onPress={() =>
                navigate('payload_recovery', {
                  jobId: job.id,
                  robot: job.robot,
                  container: targetContainer,
                })
              }
              accessibilityLabel="Initiate emergency cargo rescue"
            />
          ) : isWaiting ? (
            <Button
              title="Verify Handover"
              variant="primary"
              size="lg"
              fullWidth
              icon={ArrowRight}
              iconPosition="right"
              onPress={() => handleOpenVerify(targetContainer)}
              accessibilityLabel="Verify handover payload"
            />
          ) : isEnRoute ? (
            <Button
              title="Track on Map"
              variant="primary"
              size="lg"
              fullWidth
              icon={Maximize2}
              iconPosition="right"
              onPress={() => navigate('live_map', { jobId: job.id, robotId: job.robot })}
              accessibilityLabel="View live AMR tracking"
            />
          ) : isCompleted ? (
            <Button
              title="Back to Jobs"
              variant="primary"
              size="lg"
              fullWidth
              icon={ArrowLeft}
              iconPosition="left"
              onPress={goBack}
              accessibilityLabel="Back to jobs"
            />
          ) : (
            <Button
              title="View Live Map"
              variant="primary"
              size="lg"
              fullWidth
              icon={Maximize2}
              iconPosition="right"
              onPress={() => navigate('live_map', { jobId: job.id, robotId: job.robot })}
              accessibilityLabel="View map"
            />
          )}
        </View>
      </View>

      {selectedTask && <JobTaskDetailSheet
        key={selectedTask.id}
        task={selectedTask}
        jobNo={job.jobNo || job.id}
        jobStatus={job.status}
        onClose={() => setSelectedTaskId(null)}
      />}

      {/* Verification Modal Sheet */}
      <VerifyModal
        visible={isVerifyOpen}
        targetContainer={verificationContainer?.code || targetContainer}
        targetContainerId={verificationContainer?.containerId}
        jobStepId={verificationStepId || undefined}
        step={verificationStep}
        jobStatus={job.status}
        robotCode={job.robot}
        location={verificationTask?.endpointCode || 'Unknown Location'}
        targetShelf={verificationTask?.endpointCode || 'Unknown Destination'}
        initialMismatch={isMismatch}
        onClose={() => setIsVerifyOpen(false)}
        onSuccess={handleVerifySuccess}
        onRefreshJob={refreshJob}
        onReportIssue={() => {
          setIsVerifyOpen(false);
          setIsIssueOpen(true);
        }}
      />

      {/* Issue Reporting Modal */}
      <IssueReportingModal
        visible={isIssueOpen}
        robotCode={job.robot}
        jobId={job.id}
        containerCode={activeContainer?.code}
        canPause={canPause}
        onClose={() => setIsIssueOpen(false)}
        onSubmit={handleIssueSubmit}
        onRefreshJob={async () => {
          await refreshJob();
          if (job.assignedRobotId) void stopStateQuery.refetch();
        }}
      />

      {pauseSheetOpen ? (
        <ReasonSheet
          title="Pause Job"
          message="Pause this running job and send a STOP (PAUSE) command to the robot. Your reason is recorded."
          confirmTitle="Pause Job"
          required
          danger
          onClose={() => setPauseSheetOpen(false)}
          onSubmit={handlePauseJob}
        />
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  refreshWarning: { padding: 12, gap: 8, backgroundColor: colors.warningBg, borderRadius: radii.md },
  stopStateBox: { padding: 12, gap: 8, backgroundColor: colors.surfaceSubtle, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  robotSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  robotSelectorChip: {
    minHeight: 44, paddingHorizontal: 16, borderRadius: radii.pill,
    justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  robotSelectorChipSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 10,
  },
  headerBtn: {
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.7,
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    gap: 2,
  },
  headerTitleTarget: { minHeight: 44, justifyContent: 'center' },
  jobIdText: {
    fontWeight: '700',
    flexShrink: 1,
  },
  robotPill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
    gap: 6,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  robotPillText: {
    fontWeight: '700',
    flexShrink: 1,
  },
  robotContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  menuDismiss: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
  },
  menuDropdown: {
    position: 'absolute',
    right: 16,
    width: 220,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 6,
    zIndex: 50,
    ...shadows.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  menuItemText: {
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 160,
    gap: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  holdBannerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  holdBannerText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 11,
  },
  locationBlock: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    padding: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  currentStopText: {
    fontWeight: '700',
  },
  telemetryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  telemetryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  telemetryDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
  },
  telemetryLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  telemetryValueBold: {
    fontWeight: '700',
    fontSize: 12,
  },
  telemetryValueMono: {
    fontWeight: '700',
    fontSize: 12,
    fontFamily: typography.fontMono,
  },
  enRouteProgressBlock: {
    gap: 6,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nudgeBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    padding: 10,
    gap: 8,
  },
  nudgeBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nudgeButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  focusCard: {
    borderWidth: 1.5,
    borderColor: colors.darkAction,
  },
  focusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  focusTargetPill: {
    backgroundColor: colors.darkAction,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  focusTargetPillText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 11,
  },
  focusBody: {
    gap: 2,
  },
  focusLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  focusBarcode: {
    fontWeight: '800',
    fontSize: 24,
    fontFamily: typography.fontMono,
    letterSpacing: 0.5,
  },
  boldQty: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  otherContainerCode: {
    fontWeight: '700',
    fontFamily: typography.fontMono,
  },
  focusDestinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  otherContainersSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    gap: 8,
  },
  otherContainersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  otherContainersLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  otherContainersList: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.sm,
    padding: 8,
    gap: 8,
  },
  otherContainerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  keepTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bottomConsole: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 16,
    gap: 10,
    ...shadows.lg,
  },
  consoleUtilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  utilityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  utilityBtnActive: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  utilityBtnSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  utilityBtnDanger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  consoleCtaRow: {
    width: '100%',
  },
});

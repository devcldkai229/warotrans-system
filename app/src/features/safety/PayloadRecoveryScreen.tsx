import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  AlertTriangle,
  Bot,
  Box,
  CheckCircle2,
  LifeBuoy,
  MapPin,
  RefreshCw,
  ScanLine,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import {
  assignRecoveryRobot,
  claimJobRecovery,
  confirmRecoveryTransfer,
  getJobDetail,
  getJobRecovery,
  getMapVersionDetail,
  getRecoveryAction,
  getUserErrorMessage,
  isRecoveryActionAllowed,
  listJobs,
  listRecoveryCandidates,
  listRobots,
  releaseJobRecovery,
  resumeRecoveryOnSameRobot,
  unassignRecoveryRobot,
  type MapVersionDetailDto,
} from '../../shared/api';
import { PERMISSIONS, sessionCan } from '../../shared/auth/permissions';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { t } from '../../shared/i18n';
import { useRealtime } from '../../shared/realtime';
import { Scanner, type ScanFeedback } from '../../shared/scan/Scanner';
import type { ThemeColors } from '../../shared/theme/colors';
import { dockReservedSpace } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { typography } from '../../shared/theme/typography';
import type {
  JobDetailResponse,
  JobRecoveryResponse,
  RecoveryRobotCandidateResponse,
  RobotResponse,
} from '../../shared/types/contracts';
import {
  Button,
  Card,
  EmptyState,
  StatusPill,
  Text,
  TextField,
} from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import {
  candidateReasonLabel,
  eligibleRecoveryEndpoints,
  recoveryActionReasonLabel,
  recoveryPhaseFromCase,
  recoveryScanProgress,
  recordRecoveryScan,
} from './payloadRecoveryData';

type BusyAction =
  | 'load'
  | 'claim'
  | 'release'
  | 'assign'
  | 'unassign'
  | 'confirm'
  | 'same_robot'
  | null;

interface CompletedRecoveryReceipt {
  mode: 'transfer' | 'same_robot';
  job: JobDetailResponse;
  carrierCode: string;
  endpointCode: string;
  count: number;
}

export function PayloadRecoveryScreen() {
  const { styles, colors } = useThemedStyles(createStyles);
  const { session } = useAuth();
  const { goBack, navigate, params, dockHeight } = useNavigation();
  const { lastJobUpdate } = useRealtime();

  const canOperate = sessionCan(session, PERMISSIONS.jobOperate);
  const requestedJobId = typeof params?.jobId === 'string' ? params.jobId : '';

  const [appActive, setAppActive] = useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );
  const [resolvedJobId, setResolvedJobId] = useState(requestedJobId);
  const [job, setJob] = useState<JobDetailResponse | null>(null);
  const [recovery, setRecovery] = useState<JobRecoveryResponse | null>(null);
  const [candidates, setCandidates] = useState<RecoveryRobotCandidateResponse[]>([]);
  const [robots, setRobots] = useState<RobotResponse[]>([]);
  const [map, setMap] = useState<MapVersionDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);

  const [selectedRobotId, setSelectedRobotId] = useState<string>('');
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>('');
  const [note, setNote] = useState('');

  const [scannedByContainerId, setScannedByContainerId] = useState<Record<string, string>>({});
  const scansRef = useRef<Record<string, string>>({});
  const [manualCode, setManualCode] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const [completed, setCompleted] = useState<CompletedRecoveryReceipt | null>(null);

  const lastCaseKeyRef = useRef<string>('');
  const loadRequestRef = useRef(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  const loadRecoveryData = useCallback(async (options: { quiet?: boolean } = {}) => {
    const reqId = ++loadRequestRef.current;
    if (!options.quiet) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      let targetJobId = requestedJobId;
      let loadedJob: JobDetailResponse | null = null;
      if (targetJobId) {
        loadedJob = await getJobDetail(targetJobId);
      } else {
        const recoveryJobs = await listJobs({ status: 'RECOVERY_REQUIRED', take: 20 });
        loadedJob = recoveryJobs[0] ?? null;
        targetJobId = loadedJob?.id ?? '';
      }

      if (loadRequestRef.current !== reqId) return;
      setResolvedJobId(targetJobId);
      setJob(loadedJob);

      if (!loadedJob) {
        setRecovery(null);
        setCandidates([]);
        setMap(null);
        return;
      }

      const [recoveryResult, robotsResult, mapResult, candidatesResult] = await Promise.allSettled([
        getJobRecovery(loadedJob.id),
        listRobots(),
        getMapVersionDetail(loadedJob.mapVersionId),
        canOperate && loadedJob.status === 'RECOVERY_REQUIRED'
          ? listRecoveryCandidates(loadedJob.id)
          : Promise.resolve<RecoveryRobotCandidateResponse[]>([]),
      ]);

      if (loadRequestRef.current !== reqId) return;
      if (recoveryResult.status === 'rejected') {
        throw recoveryResult.reason;
      }

      const loadedRecovery = recoveryResult.value;
      const loadedRobots = robotsResult.status === 'fulfilled' ? robotsResult.value.items : [];
      const loadedMap = mapResult.status === 'fulfilled' ? mapResult.value : null;
      const loadedCandidates = candidatesResult.status === 'fulfilled' ? candidatesResult.value : [];

      setRecovery(loadedRecovery);
      setRobots(loadedRobots);
      setMap(loadedMap);
      setCandidates(loadedCandidates);
      setLoadError(null);

      const nextCaseKey = loadedRecovery
        ? `${loadedRecovery.id}:${loadedRecovery.status}:${loadedRecovery.toRobotId || ''}`
        : '';
      if (lastCaseKeyRef.current && lastCaseKeyRef.current !== nextCaseKey) {
        scansRef.current = {};
        setScannedByContainerId({});
        setScanError(null);
        setManualCode('');
        setScannerOpen(false);
      }
      lastCaseKeyRef.current = nextCaseKey;

      const eligibleRobots = loadedCandidates.filter(c => c.eligible);
      setSelectedRobotId((prev) =>
        eligibleRobots.some(c => c.robotId === prev) ? prev : (eligibleRobots[0]?.robotId ?? ''),
      );

      const endpoints = eligibleRecoveryEndpoints(loadedMap);
      setSelectedEndpointId((prev) =>
        endpoints.some(ep => ep.id === prev) ? prev : (endpoints[0]?.id ?? ''),
      );
    } catch (failure) {
      if (loadRequestRef.current !== reqId) return;
      const msg = getUserErrorMessage(failure, 'Recovery context could not be loaded.');
      if (options.quiet) {
        setActionError(msg);
      } else {
        setLoadError(msg);
      }
    } finally {
      if (loadRequestRef.current === reqId && !options.quiet) {
        setLoading(false);
      }
    }
  }, [requestedJobId, canOperate]);

  useEffect(() => {
    scansRef.current = {};
    setScannedByContainerId({});
    setManualCode('');
    setScanError(null);
    setActionError(null);
    setCompleted(null);
    void loadRecoveryData();
  }, [loadRecoveryData]);

  useEffect(() => {
    if (!lastJobUpdate || !resolvedJobId || lastJobUpdate.jobId !== resolvedJobId) return;
    void loadRecoveryData({ quiet: true });
  }, [lastJobUpdate, resolvedJobId, loadRecoveryData]);

  useEffect(() => {
    if (
      !appActive
      || !resolvedJobId
      || !recovery
      || recovery.status !== 'TARGET_ASSIGNED'
      || recovery.robotArrived
    ) {
      return;
    }
    const timer = setInterval(() => {
      void loadRecoveryData({ quiet: true });
    }, 5_000);
    return () => clearInterval(timer);
  }, [appActive, resolvedJobId, recovery?.status, recovery?.robotArrived, loadRecoveryData]);

  const endpoints = useMemo(() => eligibleRecoveryEndpoints(map), [map]);
  const robotCodeFor = useCallback(
    (id: string | null | undefined, fallback = '—') => {
      if (!id) return fallback;
      return (
        robots.find(r => r.id === id)?.code
        || candidates.find(c => c.robotId === id)?.robotCode
        || fallback
      );
    },
    [robots, candidates],
  );
  const endpointLabelFor = useCallback(
    (id: string | null | undefined, fallback = '—') => {
      if (!id) return fallback;
      const ep = map?.endpoints.find(item => item.id === id);
      return ep ? `${ep.code} · ${ep.name}` : fallback;
    },
    [map],
  );

  const phase = recoveryPhaseFromCase(recovery, session?.id);
  const scanProgress = recoveryScanProgress(recovery, scannedByContainerId);

  const canClaim = canOperate && isRecoveryActionAllowed(recovery, 'CLAIM');
  const canRelease = canOperate && isRecoveryActionAllowed(recovery, 'RELEASE');
  const canAssign = canOperate && isRecoveryActionAllowed(recovery, 'ASSIGN');
  const canUnassign = canOperate && isRecoveryActionAllowed(recovery, 'UNASSIGN');
  const canConfirm = canOperate && isRecoveryActionAllowed(recovery, 'CONFIRM');
  const canResumeSameRobot = canOperate && isRecoveryActionAllowed(recovery, 'RESUME_SAME_ROBOT');

  const requestInactiveReason = [
    getRecoveryAction(recovery, 'ASSIGN')?.reason,
    getRecoveryAction(recovery, 'CONFIRM')?.reason,
    getRecoveryAction(recovery, 'RESUME_SAME_ROBOT')?.reason,
  ].find(reason => reason === 'recovery_request_inactive');

  const blockingReasonText =
    recoveryActionReasonLabel(requestInactiveReason)
    || (phase === 'claim' ? recoveryActionReasonLabel(getRecoveryAction(recovery, 'CLAIM')?.reason) : null)
    || (phase === 'en_route' ? recoveryActionReasonLabel(getRecoveryAction(recovery, 'CONFIRM')?.reason) : null);

  const runRecoveryMutation = async (
    kind: BusyAction,
    fn: () => Promise<JobRecoveryResponse>,
  ) => {
    if (busy) return;
    triggerHaptic('tap');
    setBusy(kind);
    setActionError(null);
    try {
      const updated = await fn();
      triggerHaptic('success');
      setRecovery(updated);
      if (kind === 'assign' || kind === 'unassign') {
        scansRef.current = {};
        setScannedByContainerId({});
        setScanError(null);
        setManualCode('');
        setScannerOpen(false);
      }
      void loadRecoveryData({ quiet: true });
    } catch (failure) {
      setActionError(getUserErrorMessage(failure, 'The recovery action failed. Refresh and try again.'));
      void loadRecoveryData({ quiet: true });
    } finally {
      setBusy(null);
    }
  };

  const applyRecoveryScan = (rawCode: string): ScanFeedback => {
    const outcome = recordRecoveryScan(recovery, scansRef.current, rawCode);
    if (!outcome.ok || !outcome.containerId) {
      const msg = outcome.message || 'This barcode is not part of the recovery manifest.';
      setScanError(msg);
      return { ok: false, message: msg };
    }
    scansRef.current = outcome.nextScanned;
    setScannedByContainerId(outcome.nextScanned);
    setManualCode('');
    setScanError(null);
    const nextProgress = recoveryScanProgress(recovery, outcome.nextScanned);
    if (nextProgress.complete) {
      setScannerOpen(false);
    }
    triggerHaptic('success');
    const codeLabel = outcome.barcode || outcome.containerId;
    return {
      ok: true,
      message: outcome.alreadyScanned
        ? t('Already scanned: {code}', { code: codeLabel })
        : t('Verified: {code}', { code: codeLabel }),
    };
  };

  const handleConfirmTransfer = async () => {
    if (!recovery || !job || busy || !canConfirm || !scanProgress.complete || !recovery.toRobotId) return;
    triggerHaptic('tap');
    setBusy('confirm');
    setActionError(null);
    try {
      const updatedJob = await confirmRecoveryTransfer(
        job.id,
        recovery.id,
        recovery.version,
        recovery.toRobotId,
        scanProgress.scans,
        note,
      );
      triggerHaptic('success');
      setCompleted({
        mode: 'transfer',
        job: updatedJob,
        carrierCode: robotCodeFor(recovery.toRobotId, 'Rescue Robot'),
        endpointCode: endpointLabelFor(recovery.recoveryEndpointId, 'Transfer Point'),
        count: scanProgress.total,
      });
    } catch (failure) {
      setActionError(getUserErrorMessage(failure, 'Payload transfer confirmation failed. Refresh and try again.'));
      void loadRecoveryData({ quiet: true });
    } finally {
      setBusy(null);
    }
  };

  const handleResumeSameRobot = async () => {
    if (!recovery || !job || busy || !canResumeSameRobot) return;
    triggerHaptic('tap');
    setBusy('same_robot');
    setActionError(null);
    try {
      const updatedJob = await resumeRecoveryOnSameRobot(
        job.id,
        recovery.id,
        recovery.version,
        note,
      );
      triggerHaptic('success');
      setCompleted({
        mode: 'same_robot',
        job: updatedJob,
        carrierCode: robotCodeFor(recovery.fromRobotId, 'Faulted Robot'),
        endpointCode: '—',
        count: recovery.containers.length,
      });
    } catch (failure) {
      setActionError(getUserErrorMessage(failure, 'Could not resume the Job on the same robot. Refresh and try again.'));
      void loadRecoveryData({ quiet: true });
    } finally {
      setBusy(null);
    }
  };

  const faultedRobotCode = robotCodeFor(
    recovery?.fromRobotId || (typeof job?.contextValues?.assignedRobotId === 'string' ? job.contextValues.assignedRobotId : null),
    typeof params?.robot === 'string' ? params.robot : 'Unknown Robot',
  );
  const rescueRobotCode = robotCodeFor(recovery?.toRobotId, 'Not Assigned');
  const destinationLabel =
    (typeof job?.contextValues?.destinationEndpointCode === 'string' && job.contextValues.destinationEndpointCode)
    || '—';
  const containerMeta = Array.isArray(job?.contextValues?.containerMeta)
    ? (job.contextValues.containerMeta as { containerId: string; code?: string; product?: string; location?: string }[])
    : [];

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label={job ? `${job.jobNo} · Payload Recovery` : 'Payload Recovery'}
        title="Emergency Cargo Rescue"
        onBack={goBack}
        rightAction={
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              void loadRecoveryData();
            }}
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('Refresh')}
          >
            <RefreshCw size={18} color={colors.textPrimary} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: dockReservedSpace(dockHeight) + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <Card padding="md" gap={8}>
            <Text variant="headline">Loading Recovery Context…</Text>
            <Text variant="body" color="textSecondary">
              Fetching recovery case, onboard container manifest, and eligible rescue robots.
            </Text>
          </Card>
        ) : loadError ? (
          <EmptyState
            icon={AlertTriangle}
            tone="danger"
            title="Recovery Context Unavailable"
            message={loadError}
            actionTitle="Retry"
            onAction={() => {
              void loadRecoveryData();
            }}
          />
        ) : completed ? (
          <Card padding="md" gap={14}>
            <View style={styles.completedHeader}>
              <View style={styles.completedBadge}>
                <CheckCircle2 size={24} color={colors.successText} />
              </View>
              <View style={styles.flexText}>
                <Text variant="title">
                  {completed.mode === 'transfer'
                    ? 'Payload Transferred to Rescue Robot'
                    : 'Job Resumed on Original Robot'}
                </Text>
                <Text variant="body" color="textSecondary">
                  {completed.mode === 'transfer'
                    ? t('Ownership of {count} container(s) moved to {robot}. The Job is currently PAUSED for a final safety check before resuming.', {
                      count: completed.count,
                      robot: completed.carrierCode,
                    })
                    : t('{robot} has retained cargo custody and the Job was updated.', {
                      robot: completed.carrierCode,
                    })}
                </Text>
              </View>
            </View>

            <View style={styles.receiptBox}>
              <View style={styles.receiptRow}>
                <Text variant="caption" color="textSecondary">Job</Text>
                <Text variant="bodyMedium" style={styles.monoText}>{completed.job.jobNo}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color="textSecondary">Job Status</Text>
                <StatusPill status={completed.job.status} size="sm" dot />
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color="textSecondary">Active Carrier</Text>
                <Text variant="bodyMedium" color="successText" style={styles.monoText}>
                  {completed.carrierCode}
                </Text>
              </View>
              {completed.mode === 'transfer' ? (
                <View style={styles.receiptRow}>
                  <Text variant="caption" color="textSecondary">Transfer Point</Text>
                  <Text variant="bodyMedium">{completed.endpointCode}</Text>
                </View>
              ) : null}
              <View style={styles.receiptRow}>
                <Text variant="caption" color="textSecondary">Containers</Text>
                <Text variant="bodyMedium">{t('{count} Container(s)', { count: completed.count })}</Text>
              </View>
            </View>

            {completed.job.status === 'PAUSED' ? (
              <View style={styles.noticeInfo}>
                <Text variant="caption" color="infoText">
                  Transfer completed. Open Job Details to verify readiness and tap Resume Job explicitly when ready.
                </Text>
              </View>
            ) : null}

            <View style={styles.actionStack}>
              <Button
                title="Open Job Details"
                variant="primary"
                size="lg"
                fullWidth
                onPress={() => navigate('job_detail', { jobId: completed.job.id })}
              />
              <Button
                title="Back to Jobs"
                variant="outline"
                size="md"
                fullWidth
                onPress={() => navigate('jobs')}
              />
            </View>
          </Card>
        ) : !job || !recovery ? (
          <EmptyState
            icon={LifeBuoy}
            tone="neutral"
            title="No Recovery Job To Display"
            message="No active recovery case was found for this job. Open Jobs to inspect active missions."
            actionTitle="Back to Jobs"
            onAction={() => navigate('jobs')}
          />
        ) : (
          <View style={styles.stack}>
            {/* Incident Banner */}
            <Card padding="md" gap={10}>
              <View style={styles.rowBetween}>
                <View style={styles.iconRow}>
                  <LifeBuoy size={20} color={colors.dangerText} />
                  <Text variant="headline">{t('{robot} · Needs Recovery', { robot: faultedRobotCode })}</Text>
                </View>
                <StatusPill
                  status={recovery.status}
                  tone={
                    recovery.status === 'TRANSFERRED' || recovery.status === 'RESUMED_SAME_ROBOT'
                      ? 'success'
                      : recovery.status === 'TARGET_ASSIGNED'
                        ? 'info'
                        : 'warning'
                  }
                  size="sm"
                  dot
                />
              </View>

              <Text variant="body" color="textSecondary">
                {job.jobNo} · {recovery.reason || job.failureMessage || job.failureCode || 'Recovery requested'}
              </Text>

              <View style={styles.diagRow}>
                <View style={styles.diagCard}>
                  <Text variant="caption" color="textSecondary">Faulted Robot</Text>
                  <Text variant="bodyMedium" style={styles.monoText}>{faultedRobotCode}</Text>
                </View>
                <View style={styles.diagCard}>
                  <Text variant="caption" color="textSecondary">Rescue Robot</Text>
                  <Text
                    variant="bodyMedium"
                    color={recovery.toRobotId ? 'successText' : 'textSecondary'}
                    style={styles.monoText}
                  >
                    {rescueRobotCode}
                  </Text>
                </View>
              </View>

              {recovery.recoveryEndpointId ? (
                <View style={styles.endpointSummary}>
                  <MapPin size={15} color={colors.primaryText} />
                  <Text variant="caption" color="textPrimary">
                    {t('Transfer Point: {point}', { point: endpointLabelFor(recovery.recoveryEndpointId) })}
                  </Text>
                </View>
              ) : null}
            </Card>

            {actionError ? (
              <View style={styles.noticeDanger}>
                <Text variant="caption" color="dangerText">{actionError}</Text>
              </View>
            ) : null}

            {requestInactiveReason && blockingReasonText ? (
              <View style={styles.noticeDanger}>
                <Text variant="caption" color="dangerText">{blockingReasonText}</Text>
              </View>
            ) : !canOperate ? (
              <View style={styles.noticeWarn}>
                <Text variant="caption" color="warningText">
                  You can inspect this recovery case, but job.operate permission is required to execute recovery steps.
                </Text>
              </View>
            ) : null}

            {/* Onboard Manifest */}
            <Card padding="md" gap={10}>
              <View style={styles.rowBetween}>
                <Text variant="headline">
                  {t('Onboard Cargo Manifest ({count})', { count: recovery.containers.length })}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {t('Target: {dest}', { dest: destinationLabel })}
                </Text>
              </View>

              {recovery.containers.map((item) => {
                const meta = containerMeta.find(m => m.containerId === item.containerId);
                const barcode = item.barcode || meta?.code || item.containerId;
                const scanned = Boolean(scannedByContainerId[item.containerId]);
                return (
                  <View key={item.containerId} style={styles.manifestRow}>
                    <View style={styles.manifestLeft}>
                      <Box size={16} color={colors.textSecondary} />
                      <View style={styles.flexText}>
                        <Text variant="bodyMedium" style={styles.monoText}>{barcode}</Text>
                        {meta?.product ? (
                          <Text variant="caption" color="textSecondary">{meta.product}</Text>
                        ) : null}
                      </View>
                    </View>
                    {recovery.status === 'TARGET_ASSIGNED' ? (
                      <StatusPill
                        status={scanned ? 'CONFIRMED' : 'WAITING'}
                        label={scanned ? t('Scanned') : t('Scan Required')}
                        tone={scanned ? 'success' : 'neutral'}
                        size="sm"
                        dot
                      />
                    ) : null}
                  </View>
                );
              })}
            </Card>

            {/* Step 1: Claim / Ownership */}
            {phase === 'resolved' || job.status !== 'RECOVERY_REQUIRED' ? (
              <Card padding="md" gap={10}>
                <Text variant="headline">Recovery Case Closed</Text>
                <Text variant="body" color="textSecondary">
                  This job is currently {job.status}. Open Job Details to inspect or continue execution.
                </Text>
                <Button
                  title="Open Job Details"
                  variant="primary"
                  size="md"
                  fullWidth
                  onPress={() => navigate('job_detail', { jobId: job.id })}
                />
              </Card>
            ) : phase === 'claimed_other' ? (
              <Card padding="md" gap={10}>
                <Text variant="headline">Held by Another Operator</Text>
                <Text variant="body" color="textSecondary">
                  Another operator has claimed this recovery case and must complete or release it before you can modify assignments.
                </Text>
              </Card>
            ) : (
              <>
                <Card padding="md" gap={10}>
                  <View style={styles.rowBetween}>
                    <Text variant="headline">Step 1 · Case Ownership</Text>
                    <StatusPill
                      status={recovery.claimedBy === session?.id ? 'ACTIVE' : 'PENDING'}
                      label={recovery.claimedBy === session?.id ? t('Claimed by You') : t('Unclaimed')}
                      tone={recovery.claimedBy === session?.id ? 'success' : 'neutral'}
                      size="sm"
                      dot
                    />
                  </View>

                  {phase === 'claim' ? (
                    <>
                      <Text variant="body" color="textSecondary">
                        Claim this recovery case to lock operator ownership before selecting a rescue robot or resuming.
                      </Text>
                      {canClaim ? (
                        <Button
                          title="Claim Recovery Case"
                          variant="primary"
                          size="lg"
                          loading={busy === 'claim'}
                          disabled={!!busy || !canClaim}
                          fullWidth
                          onPress={() => {
                            void runRecoveryMutation('claim', () =>
                              claimJobRecovery(job.id, recovery.id, recovery.version),
                            );
                          }}
                        />
                      ) : blockingReasonText ? (
                        <Text variant="caption" color="warningText">{blockingReasonText}</Text>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Text variant="caption" color="textSecondary">
                        {t('Case v{version} claimed by you.', { version: recovery.version })}
                      </Text>
                      {canRelease ? (
                        <Button
                          title="Release Case"
                          variant="outline"
                          size="sm"
                          loading={busy === 'release'}
                          disabled={!!busy}
                          onPress={() => {
                            void runRecoveryMutation('release', () =>
                              releaseJobRecovery(job.id, recovery.id, recovery.version),
                            );
                          }}
                        />
                      ) : null}
                    </>
                  )}
                </Card>

                {/* Step 2A: Assign Rescue Robot or Resume on Same Robot */}
                {phase === 'assign' ? (
                  <>
                    <Card padding="md" gap={12}>
                      <Text variant="headline">Step 2 · Dispatch Rescue Robot</Text>
                      <Text variant="body" color="textSecondary">
                        Select an eligible rescue robot with sufficient container capacity and an enabled transfer endpoint on this map.
                      </Text>

                      <Text variant="label" color="textSecondary">Candidate Rescue Robots</Text>
                      {candidates.length === 0 ? (
                        <View style={styles.noticeWarn}>
                          <Text variant="caption" color="warningText">
                            No candidate rescue robots are currently listed. Keep this case open until an eligible robot is available or resume on the original robot.
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.pickerList}>
                          {candidates.map((candidate) => {
                            const selected = candidate.robotId === selectedRobotId;
                            return (
                              <Pressable
                                key={candidate.robotId}
                                disabled={!candidate.eligible || !canAssign || !!busy}
                                onPress={() => {
                                  triggerHaptic('tap');
                                  setSelectedRobotId(candidate.robotId);
                                }}
                                accessibilityRole="button"
                                accessibilityState={{ selected, disabled: !candidate.eligible || !canAssign }}
                                style={({ pressed }) => [
                                  styles.pickerOption,
                                  selected && candidate.eligible && styles.pickerOptionSelected,
                                  !candidate.eligible && styles.pickerOptionDisabled,
                                  pressed && candidate.eligible && styles.pressed,
                                ]}
                              >
                                <View style={styles.rowBetween}>
                                  <View style={styles.iconRow}>
                                    <Bot
                                      size={16}
                                      color={candidate.eligible ? colors.primaryText : colors.textMuted}
                                    />
                                    <Text variant="bodyMedium" style={styles.monoText}>
                                      {candidate.robotCode}
                                    </Text>
                                  </View>
                                  <StatusPill
                                    status={candidate.eligible ? 'READY' : 'ERROR'}
                                    label={candidate.eligible ? t('Eligible') : t('Ineligible')}
                                    tone={candidate.eligible ? 'success' : 'neutral'}
                                    size="sm"
                                  />
                                </View>
                                <Text variant="caption" color="textSecondary">
                                  {t('Max {count} containers', { count: candidate.maxContainers })}
                                </Text>
                                {!candidate.eligible && candidate.reasons.length > 0 ? (
                                  <Text variant="caption" color="dangerText">
                                    {candidate.reasons.map(r => t(candidateReasonLabel(r))).join(' · ')}
                                  </Text>
                                ) : null}
                              </Pressable>
                            );
                          })}
                        </View>
                      )}

                      <Text variant="label" color="textSecondary">Transfer Point (Map Endpoint)</Text>
                      {endpoints.length === 0 ? (
                        <View style={styles.noticeWarn}>
                          <Text variant="caption" color="warningText">
                            No enabled endpoints found on this map version.
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.endpointGrid}>
                          {endpoints.map((ep) => {
                            const selected = ep.id === selectedEndpointId;
                            return (
                              <Pressable
                                key={ep.id}
                                disabled={!canAssign || !!busy}
                                onPress={() => {
                                  triggerHaptic('tap');
                                  setSelectedEndpointId(ep.id);
                                }}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                style={({ pressed }) => [
                                  styles.endpointChip,
                                  selected && styles.pickerOptionSelected,
                                  pressed && styles.pressed,
                                ]}
                              >
                                <Text variant="label" color={selected ? 'primaryText' : 'textPrimary'} style={styles.monoText}>
                                  {ep.code}
                                </Text>
                                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                                  {ep.name}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}

                      <Button
                        title="Assign Rescue Robot"
                        variant="primary"
                        size="lg"
                        loading={busy === 'assign'}
                        disabled={!!busy || !canAssign || !selectedRobotId || !selectedEndpointId}
                        fullWidth
                        onPress={() => {
                          void runRecoveryMutation('assign', () =>
                            assignRecoveryRobot(
                              job.id,
                              recovery.id,
                              recovery.version,
                              selectedRobotId,
                              selectedEndpointId,
                            ),
                          );
                        }}
                      />
                    </Card>

                    {/* Alternate: Resume on same robot */}
                    <Card padding="md" gap={10}>
                      <Text variant="headline">Or Continue with Original Robot</Text>
                      <Text variant="body" color="textSecondary">
                        {t('If {robot} recovered and still holds all cargo, you can resume the Job on it instead of transferring.', {
                          robot: faultedRobotCode,
                        })}
                      </Text>
                      <TextField
                        label="Recovery Note (Optional)"
                        value={note}
                        onChangeText={setNote}
                        placeholder="Explain fault clearance or condition"
                        maxLength={500}
                        editable={!busy}
                      />
                      <Button
                        title={t('Resume on {robot}', { robot: faultedRobotCode })}
                        variant="outline"
                        size="md"
                        loading={busy === 'same_robot'}
                        disabled={!!busy || !canResumeSameRobot}
                        fullWidth
                        onPress={() => {
                          void handleResumeSameRobot();
                        }}
                      />
                    </Card>
                  </>
                ) : null}

                {/* Step 2B/3: En route or Confirm Transfer */}
                {(phase === 'en_route' || phase === 'confirm') ? (
                  <Card padding="md" gap={12}>
                    <View style={styles.rowBetween}>
                      <Text variant="headline">
                        {phase === 'confirm'
                          ? 'Step 3 · Verify & Confirm Transfer'
                          : 'Step 2 · Rescue Robot En Route'}
                      </Text>
                      <StatusPill
                        status={recovery.robotArrived ? 'READY' : 'EN_ROUTE'}
                        label={recovery.robotArrived ? t('Arrived at Point') : t('En Route')}
                        tone={recovery.robotArrived ? 'success' : 'info'}
                        size="sm"
                        dot
                      />
                    </View>

                    <Text variant="body" color="textSecondary">
                      {recovery.robotArrived
                        ? t('Move all {count} container(s) onto {robot}, scan every container barcode below, then confirm the transfer.', {
                          count: recovery.containers.length,
                          robot: rescueRobotCode,
                        })
                        : t('{robot} is moving to {point}. Wait for arrival before transferring and confirming the payload.', {
                          robot: rescueRobotCode,
                          point: endpointLabelFor(recovery.recoveryEndpointId),
                        })}
                    </Text>

                    {recovery.robotArrived ? (
                      <>
                        <View style={styles.scanRow}>
                          <View style={styles.flexText}>
                            <TextField
                              value={manualCode}
                              onChangeText={setManualCode}
                              placeholder={t('Scan or type container barcode')}
                              autoCapitalize="characters"
                              autoCorrect={false}
                              editable={!busy}
                              accessibilityLabel={t('Container Barcode')}
                            />
                          </View>
                          <Button
                            title="Verify"
                            variant="outline"
                            size="sm"
                            disabled={!!busy || !manualCode.trim()}
                            onPress={() => {
                              triggerHaptic('tap');
                              applyRecoveryScan(manualCode);
                            }}
                          />
                        </View>

                        {scanError ? (
                          <Text variant="caption" color="dangerText">{scanError}</Text>
                        ) : null}

                        <TextField
                          label="Transfer Note (Optional)"
                          value={note}
                          onChangeText={setNote}
                          placeholder="Record physical transfer details if needed"
                          maxLength={500}
                          editable={!busy}
                        />

                        <View style={styles.actionRow}>
                          <Button
                            title={scannerOpen ? 'Scanning…' : 'Scan Container'}
                            icon={ScanLine}
                            variant="outline"
                            size="md"
                            disabled={!!busy}
                            onPress={() => {
                              triggerHaptic('tap');
                              setScannerOpen(true);
                            }}
                            style={styles.flexBtn}
                          />
                          <Button
                            title={t('Confirm Payload Transfer ({done}/{total})', {
                              done: scanProgress.done,
                              total: scanProgress.total,
                            })}
                            variant="primary"
                            size="md"
                            loading={busy === 'confirm'}
                            disabled={!!busy || !canConfirm || !scanProgress.complete}
                            onPress={() => {
                              void handleConfirmTransfer();
                            }}
                            style={styles.flexBtn}
                          />
                        </View>
                      </>
                    ) : null}

                    {canUnassign ? (
                      <Button
                        title="Call Back Rescue Robot"
                        variant="outline"
                        size="md"
                        loading={busy === 'unassign'}
                        disabled={!!busy}
                        fullWidth
                        onPress={() => {
                          void runRecoveryMutation('unassign', () =>
                            unassignRecoveryRobot(job.id, recovery.id, recovery.version),
                          );
                        }}
                      />
                    ) : null}
                  </Card>
                ) : null}
              </>
            )}
          </View>
        )}
      </ScrollView>

      <Scanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        expect={['CONTAINER']}
        continuous={!scanProgress.complete}
        title="Scan Recovery Containers"
        manualLabel="Container Barcode"
        onScanResult={(barcode) => applyRecoveryScan(barcode)}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    refreshBtn: {
      width: 44,
      height: 44,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.72,
    },
    scrollContent: {
      padding: 16,
      gap: 14,
    },
    stack: {
      gap: 14,
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    iconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 1,
    },
    flexText: {
      flex: 1,
      minWidth: 0,
    },
    monoText: {
      fontFamily: typography.fontMono,
      fontWeight: '700',
    },
    diagRow: {
      flexDirection: 'row',
      gap: 10,
    },
    diagCard: {
      flex: 1,
      padding: 10,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSubtle,
      gap: 4,
    },
    endpointSummary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: 4,
    },
    noticeDanger: {
      padding: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      backgroundColor: colors.dangerBg,
    },
    noticeWarn: {
      padding: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.warningBorder,
      backgroundColor: colors.warningBg,
    },
    noticeInfo: {
      padding: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.infoBorder,
      backgroundColor: colors.infoBg,
    },
    manifestRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    manifestLeft: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    pickerList: {
      gap: 8,
    },
    pickerOption: {
      minHeight: 48,
      padding: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSubtle,
      gap: 4,
    },
    pickerOptionSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryLight,
    },
    pickerOptionDisabled: {
      opacity: 0.65,
    },
    endpointGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    endpointChip: {
      minHeight: 44,
      minWidth: 108,
      flexGrow: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSubtle,
      justifyContent: 'center',
      gap: 2,
    },
    scanRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
    },
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    flexBtn: {
      flexGrow: 1,
      minWidth: 132,
    },
    actionStack: {
      gap: 10,
    },
    completedHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    completedBadge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.successBg,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    receiptBox: {
      padding: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSubtle,
      gap: 8,
    },
    receiptRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
  });

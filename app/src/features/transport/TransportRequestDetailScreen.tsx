import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowDown, Box, ChevronRight, MapPin, Truck } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import {
  cancelTransportRequest, getTransportRequest, getUserErrorMessage, getWorkflow, isActionAllowed, listJobSummaries, listRobots,
  queueTransportRequest, rejectTransportRequest,
} from '../../shared/api';
import { useAuth } from '../auth/authContext';
import { PERMISSIONS, sessionCan } from '../../shared/auth/permissions';
import { toast } from '../../shared/context/ToastContext';
import { t } from '../../shared/i18n';
import { startQueuedJobs } from './startQueuedJobs';
import { useRealtime } from '../../shared/realtime';
import { ThemeColors } from '../../shared/theme/colors';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { radii } from '../../shared/theme/radii';
import { Button, Card, ProgressMeter, ReasonSheet, ScreenHeader, StatusPill, Text } from '../../shared/ui';
import {
  detailWarehouseSyncEntries,
  hasPendingWarehouseSync,
  summarizeWarehouseSync,
  transportDate,
  transportRequestProgress,
  warehouseSyncLabel,
  warehouseSyncTone,
} from './transportRequestData';

export function TransportRequestDetailScreen() {
  const { styles, colors } = useThemedStyles(createStyles);
  const { params, navigate, goBack } = useNavigation();
  const requestId = typeof params?.requestId === 'string' ? params.requestId : '';
  const insets = useSafeAreaInsets();
  const { lastJobUpdate, lastTransportStatus, isConnected } = useRealtime();
  const queryClient = useQueryClient();
  const requestKey = ['transport-request', requestId];
  const jobsKey = ['transport-request-jobs', requestId];
  const request = useQuery({
    queryKey: requestKey,
    queryFn: () => getTransportRequest(requestId),
    enabled: !!requestId,
    refetchInterval: q => hasPendingWarehouseSync(q.state.data?.details ?? []) ? 3_000 : 5_000,
  });
  const jobs = useQuery({
    queryKey: jobsKey,
    queryFn: () => listJobSummaries({ transportRequestId: requestId, take: 200 }),
    enabled: !!request.data,
    refetchInterval: 5_000,
  });
  const workflow = useQuery({
    queryKey: ['workflow', request.data?.workflowId],
    queryFn: () => getWorkflow(request.data!.workflowId),
    enabled: !!request.data?.workflowId,
  });
  const fleet = useQuery({
    queryKey: ['request-fleet', request.data?.warehouseId],
    queryFn: () => listRobots({ warehouseId: request.data!.warehouseId }),
    enabled: !!request.data && !!jobs.data?.items.some(job => job.assignedRobotId),
  });

  useEffect(() => {
    if (!lastJobUpdate || !requestId) return;
    void queryClient.invalidateQueries({ queryKey: ['transport-request', requestId] });
    void queryClient.invalidateQueries({ queryKey: ['transport-request-jobs', requestId] });
  }, [lastJobUpdate, requestId, queryClient]);

  // RTM-02: this request moved (detail delivered, cancelled, rejected …): refetch it from the API.
  useEffect(() => {
    if (!lastTransportStatus || lastTransportStatus.transportRequestId !== requestId) return;
    void queryClient.invalidateQueries({ queryKey: ['transport-request', requestId] });
    void queryClient.invalidateQueries({ queryKey: ['transport-request-jobs', requestId] });
  }, [lastTransportStatus, requestId, queryClient]);

  const data = request.data;
  const syncSummary = useMemo(() => summarizeWarehouseSync(data?.details ?? []), [data?.details]);
  const wasSyncPending = useRef(false);
  const previousConnected = useRef(isConnected);

  useEffect(() => {
    wasSyncPending.current = false;
  }, [requestId]);

  useEffect(() => {
    if (wasSyncPending.current && !syncSummary.needsRefresh) {
      void queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-containers'] });
      void queryClient.invalidateQueries({ queryKey: ['outbound-voucher-preview'] });
    }
    wasSyncPending.current = syncSummary.needsRefresh;
  }, [syncSummary.needsRefresh, queryClient]);

  useEffect(() => {
    if (!requestId || !syncSummary.needsRefresh) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void request.refetch();
    });
    return () => subscription.remove();
  }, [requestId, syncSummary.needsRefresh, request.refetch]);

  useEffect(() => {
    const justReconnected = !previousConnected.current && isConnected;
    previousConnected.current = isConnected;
    if (justReconnected && requestId && syncSummary.needsRefresh) {
      void request.refetch();
    }
  }, [isConnected, requestId, syncSummary.needsRefresh, request.refetch]);

  const refresh = () => { void request.refetch(); void jobs.refetch(); };
  const { session } = useAuth();
  const [sheet, setSheet] = useState<'cancel' | 'reject' | null>(null);
  const [busy, setBusy] = useState<'queue' | 'start' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canStartJobs = sessionCan(session, PERMISSIONS.jobOperate);
  // Jobs planned but not started yet (queued without "start right away", or a start that found no free robot).
  const unstarted = (jobs.data?.items || []).filter(job => job.status === 'CREATED' || job.status === 'QUEUED');
  const afterAction = () => {
    void queryClient.invalidateQueries({ queryKey: requestKey });
    void queryClient.invalidateQueries({ queryKey: jobsKey });
    void queryClient.invalidateQueries({ queryKey: ['transport-requests'] });
  };
  const queue = async () => {
    if (busy || !data) return;
    setBusy('queue'); setActionError(null);
    try { await queueTransportRequest(data.id); toast.success(`${data.requestCode} queued.`); afterAction(); }
    catch (failure) { setActionError(getUserErrorMessage(failure, 'The request could not be queued.')); }
    finally { setBusy(null); }
  };
  const startOnRobot = async () => {
    if (busy || !unstarted.length) return;
    setBusy('start'); setActionError(null);
    try {
      const results = await startQueuedJobs(unstarted.map(job => ({ jobId: job.id, jobNo: job.jobNo })));
      const failed = results.filter(item => item.error);
      results.filter(item => !item.error).forEach(item => toast.success(`${item.jobNo} started${item.robot ? ` on ${item.robot}` : ''}.`));
      if (failed.length) setActionError(failed.map(item => `${item.jobNo}: ${item.error}`).join(' · '));
      afterAction();
    } finally { setBusy(null); }
  };
  const progress = transportRequestProgress(data?.details || []);

  return (
    <View style={styles.root}>
      <ScreenHeader title="Transport Request" subtitle={data?.requestCode || 'Request Details'} canGoBack onBack={goBack} />
      {!requestId || !data ? (
        <View style={styles.state}>
          {requestId && request.isPending ? <ActivityIndicator color={colors.primary} /> : null}
          <Text variant="headline">{!requestId ? 'No Request Selected' : request.isPending ? 'Loading Request…' : 'Request Unavailable'}</Text>
          {request.error ? <Text variant="body" color={colors.dangerText}>{request.error.message}</Text> : null}
          {requestId && request.isError ? <Button title="Retry" onPress={() => { void request.refetch(); }} /> : null}
          <Button title="Back To Transport History" variant="outline" onPress={() => navigate('transport_history')} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}
          refreshControl={<RefreshControl refreshing={request.isRefetching || jobs.isRefetching} onRefresh={refresh} tintColor={colors.primary} />}
        >
          {request.isError ? <Card><Text variant="body" color={colors.dangerText}>Request could not be refreshed. Showing the last loaded data.</Text><Button title="Retry" variant="outline" onPress={refresh} /></Card> : null}

          {/* BOTH-04: the buttons follow the server's availableActions for this user, as on the web console. */}
          {isActionAllowed(data, 'QUEUE') || (canStartJobs && unstarted.length > 0) || isActionAllowed(data, 'CANCEL') || isActionAllowed(data, 'REJECT') ? (
            <Card gap={10}>
              {isActionAllowed(data, 'QUEUE') ? <Button title="Queue Request" onPress={queue} loading={busy === 'queue'} disabled={!!busy} fullWidth /> : null}
              {canStartJobs && unstarted.length > 0 ? <Button title={unstarted.length > 1 ? `Start ${unstarted.length} Jobs On Robots` : 'Start On Robot'}
                onPress={startOnRobot} loading={busy === 'start'} disabled={!!busy} fullWidth /> : null}
              {isActionAllowed(data, 'CANCEL') ? <Button title="Cancel Request" variant="outline" onPress={() => setSheet('cancel')} disabled={!!busy} fullWidth /> : null}
              {isActionAllowed(data, 'REJECT') ? <Button title="Reject Request" variant="outline" onPress={() => setSheet('reject')} disabled={!!busy} fullWidth /> : null}
              {actionError ? <Text variant="body" color={colors.dangerText}>{actionError}</Text> : null}
            </Card>
          ) : null}

          <Card gap={12}>
            <StatusPill status={data.status} dot />
            <Text variant="headline" selectable>{data.requestCode}</Text>
            <Text variant="bodyMedium">{workflow.data?.name || 'Workflow Name Unavailable'}</Text>
            {!workflow.data ? <Text variant="code">Workflow ID: {data.workflowId}</Text> : null}
            <View style={styles.summaryRow}>
              <View style={styles.summaryCell}><Text variant="title">{progress.total}</Text><Text variant="caption">Containers To Move</Text></View>
              <View style={styles.summaryCell}><Text variant="title">{progress.completed}/{progress.total}</Text><Text variant="caption">Movements Completed</Text></View>
            </View>
            <ProgressMeter value={progress.percent} accessibilityLabel="Transport request movement completion" />
            <Text variant="caption">Submitted: {transportDate(data.submittedAt)}</Text>
            {data.queuedAt ? <Text variant="caption">Queued: {transportDate(data.queuedAt)}</Text> : null}
            {data.completedAt ? <Text variant="caption">Completed: {transportDate(data.completedAt)}</Text> : null}
            {data.note ? <View style={styles.note}><Text variant="label">Request Note</Text><Text variant="body">{data.note}</Text></View> : null}
            {data.failureCode || data.failureMessage ? <View style={styles.error}><Text variant="body" color={colors.dangerText}>{[data.failureCode, data.failureMessage].filter(Boolean).join(' · ')}</Text></View> : null}
            {syncSummary.retrying > 0 ? (
              <View style={styles.syncErrorBanner}>
                <View style={styles.flex}>
                  <Text variant="label" color="dangerText">Warehouse Sync Retrying</Text>
                  <Text variant="caption" color="dangerText">
                    {t('{count} handover posting(s) failed and the server is retrying. Job completion does not confirm inventory has updated.', { count: syncSummary.retrying })}
                  </Text>
                </View>
                <Button title="Refresh" variant="outline" size="sm" loading={request.isRefetching} onPress={refresh} />
              </View>
            ) : syncSummary.pending > 0 ? (
              <View style={styles.syncWarningBanner}>
                <View style={styles.flex}>
                  <Text variant="label" color="warningText">Warehouse Sync Pending</Text>
                  <Text variant="caption" color="warningText">
                    {t('{count} handover posting(s) recorded and waiting for Warehouse stock update. Job completion does not confirm inventory has updated.', { count: syncSummary.pending })}
                  </Text>
                </View>
                <Button title="Refresh" variant="outline" size="sm" loading={request.isRefetching} onPress={refresh} />
              </View>
            ) : null}
          </Card>

          <View style={styles.sectionHeading}><Box size={18} color={colors.primaryText} /><Text variant="headline">Movement Details ({data.details.length})</Text></View>
          {!data.details.length ? <Card><Text variant="body">No movement details are available for this request.</Text></Card> : null}
          {[...data.details].sort((a, b) => a.sequenceNo - b.sequenceNo).map(detail => {
            const syncEntries = detailWarehouseSyncEntries(detail);
            return (
              <Card key={detail.id} gap={12}>
                <View style={styles.detailHeading}>
                  <View style={styles.flex}><Text variant="caption">Movement {detail.sequenceNo} · 1 Container</Text><Text variant="bodyMedium" selectable>{detail.containerBarcode || detail.containerId}</Text></View>
                  <StatusPill status={detail.status} size="sm" dot />
                </View>
                <View style={styles.route}>
                  <View style={styles.routeRow}><MapPin size={16} color={colors.primaryText} /><View style={styles.flex}>
                    <Text variant="caption">Pickup</Text>
                    <Text variant="bodyMedium">{detail.sourceEndpointCode || detail.sourceEndpointName || detail.sourceEndpointId}</Text>
                    {detail.sourceStorageLocationId || detail.sourceLevelNo != null ? <Text variant="caption">{[detail.sourceStorageLocationCode || detail.sourceStorageLocationId, detail.sourceLevelNo != null ? `Level ${detail.sourceLevelNo}` : null].filter(Boolean).join(' · ')}</Text> : null}
                  </View></View>
                  <ArrowDown size={14} color={colors.textMuted} style={styles.routeArrow} />
                  <View style={styles.routeRow}><MapPin size={16} color={colors.successText} /><View style={styles.flex}>
                    <Text variant="caption">Destination</Text>
                    <Text variant="bodyMedium">{detail.destinationEndpointCode || detail.destinationEndpointName || detail.destinationEndpointId}</Text>
                    {detail.destinationStorageLocationId || detail.destinationLevelNo != null ? <Text variant="caption">{[detail.destinationStorageLocationCode || detail.destinationStorageLocationId, detail.destinationLevelNo != null ? `Level ${detail.destinationLevelNo}` : null].filter(Boolean).join(' · ')}</Text> : null}
                  </View></View>
                </View>
                {syncEntries.length > 0 ? (
                  <View style={styles.syncSection}>
                    <Text variant="label" color="textSecondary">Warehouse Sync</Text>
                    {syncEntries.map(({ stage, posting }) => {
                      const matchedJob = jobs.data?.items.find(item => item.id === posting.jobId);
                      const stageTitle = stage === 'pickup' ? t('Pickup Sync') : t('Delivery Sync');
                      return (
                        <View key={stage} style={styles.syncRow}>
                          <View style={styles.flex}>
                            <Text variant="caption" color="textPrimary">
                              {matchedJob ? `${stageTitle} · ${matchedJob.jobNo}` : stageTitle}
                            </Text>
                            {posting.status === 'POSTED' && posting.postedAt ? (
                              <Text variant="caption" color="textSecondary">
                                {t('Synced: {date}', { date: transportDate(posting.postedAt) })}
                              </Text>
                            ) : (
                              <>
                                <Text variant="caption" color="textSecondary">
                                  {t('Recorded: {date}', { date: transportDate(posting.recordedAt) })}
                                </Text>
                                {posting.nextAttemptAt ? (
                                  <Text variant="caption" color="textSecondary">
                                    {t('Next retry: {date}', { date: transportDate(posting.nextAttemptAt) })}
                                  </Text>
                                ) : null}
                              </>
                            )}
                          </View>
                          <StatusPill
                            status={posting.status}
                            label={warehouseSyncLabel(posting.status)}
                            tone={warehouseSyncTone(posting.status)}
                            size="sm"
                            dot
                          />
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </Card>
            );
          })}

          <View style={styles.sectionHeading}><Truck size={18} color={colors.primaryText} /><Text variant="headline">Related Jobs{jobs.data ? ` (${jobs.data.total})` : ''}</Text></View>
          <Text variant="caption">Select a job to view its robot, tasks and execution steps.</Text>
          {jobs.isPending ? <ActivityIndicator color={colors.primary} /> : null}
          {jobs.isError ? <Card gap={12}><Text variant="body" color={colors.dangerText}>Related jobs could not be loaded. {jobs.error.message}</Text><Button title="Retry Jobs" variant="outline" onPress={() => { void jobs.refetch(); }} /></Card> : null}
          {jobs.data && !jobs.isError ? (
            <>
              {jobs.data.total > jobs.data.items.length ? <Card><Text variant="body" color={colors.warningText}>Showing {jobs.data.items.length} of {jobs.data.total} jobs. The server currently returns up to 200 jobs per request.</Text></Card> : null}
              {!jobs.data.items.length ? <Card><Text variant="body">No jobs have been created for this request.</Text></Card> : null}
              {jobs.data.items.map(job => {
                const robot = fleet.data?.items.find(robot => robot.id === job.assignedRobotId);
                return (
                  <Pressable key={job.id} onPress={() => navigate('job_detail', { jobId: job.id })} accessibilityRole="button" accessibilityLabel={`View job ${job.jobNo}`} style={({ pressed }) => [styles.jobCard, pressed && styles.pressed]}>
                    <View style={styles.detailHeading}><Text variant="bodyMedium" style={styles.flex}>{job.jobNo}</Text><StatusPill status={job.status} size="sm" dot /><ChevronRight size={18} color={colors.textMuted} /></View>
                    <Text variant="caption">{job.containerCount} Containers · {job.completedSteps}/{job.totalSteps} Steps Completed</Text>
                    <ProgressMeter value={job.totalSteps ? job.completedSteps / job.totalSteps * 100 : 0} accessibilityLabel={`${job.jobNo} step completion`} />
                    <Text variant="caption">Robot: {robot?.code || job.assignedRobotId || 'Unassigned'}</Text>
                    {job.failureCode ? <Text variant="caption" color={colors.dangerText}>{job.failureCode}</Text> : null}
                    <Text variant="caption">Created: {transportDate(job.createdAt)}</Text>
                  </Pressable>
                );
              })}
            </>
          ) : null}
        </ScrollView>
      )}
      {sheet === 'cancel' && data ? <ReasonSheet title="Cancel Request" danger required confirmTitle="Cancel Request"
        message="Its Jobs stop. Containers not picked up stay where they are; cargo already on a robot keeps the request Cancelling until it is unloaded."
        onClose={() => setSheet(null)}
        onSubmit={async reason => { await cancelTransportRequest(data.id, reason); setSheet(null); toast.success(`${data.requestCode} cancelled.`); afterAction(); }} /> : null}
      {sheet === 'reject' && data ? <ReasonSheet title="Reject Request" danger required confirmTitle="Reject Request"
        message="Only before any of its Jobs ran. The requester is notified with your reason."
        onClose={() => setSheet(null)}
        onSubmit={async reason => { await rejectTransportRequest(data.id, reason); setSheet(null); toast.success(`${data.requestCode} rejected.`); afterAction(); }} /> : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  state: { padding: 24, gap: 16 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14 },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  summaryCell: { flex: 1, minWidth: 100, gap: 4 },
  note: { backgroundColor: colors.surfaceSubtle, borderRadius: radii.sm, padding: 12, gap: 6 },
  error: { backgroundColor: colors.dangerBg, borderRadius: radii.sm, padding: 12 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  detailHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  route: { backgroundColor: colors.surfaceSubtle, borderRadius: radii.md, padding: 12, gap: 8 },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  routeArrow: { marginLeft: 1 },
  syncWarningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    backgroundColor: colors.warningBg, borderColor: colors.warningBorder, borderWidth: 1, borderRadius: radii.md,
  },
  syncErrorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder, borderWidth: 1, borderRadius: radii.md,
  },
  syncSection: {
    backgroundColor: colors.surfaceSubtle, borderRadius: radii.md, padding: 12, gap: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  syncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  jobCard: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12, minHeight: 44 },
  pressed: { opacity: 0.75 },
});

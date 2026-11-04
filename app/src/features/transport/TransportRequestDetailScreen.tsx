import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowDown, Box, ChevronRight, MapPin, Truck } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { getTransportRequest, getWorkflow, listJobSummaries, listRobots } from '../../shared/api';
import { useRealtime } from '../../shared/realtime';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { Button, Card, ProgressMeter, ScreenHeader, StatusPill, Text } from '../../shared/ui';
import { transportDate, transportRequestProgress } from './transportRequestData';

export function TransportRequestDetailScreen() {
  const { params, navigate, goBack } = useNavigation();
  const requestId = typeof params?.requestId === 'string' ? params.requestId : '';
  const insets = useSafeAreaInsets();
  const { lastJobUpdate } = useRealtime();
  const queryClient = useQueryClient();
  const requestKey = ['transport-request', requestId];
  const jobsKey = ['transport-request-jobs', requestId];
  const request = useQuery({ queryKey: requestKey, queryFn: () => getTransportRequest(requestId), enabled: !!requestId, refetchInterval: 5_000 });
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

  const refresh = () => { void request.refetch(); void jobs.refetch(); };
  const data = request.data;
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
          </Card>

          <View style={styles.sectionHeading}><Box size={18} color={colors.primaryText} /><Text variant="headline">Movement Details ({data.details.length})</Text></View>
          {!data.details.length ? <Card><Text variant="body">No movement details are available for this request.</Text></Card> : null}
          {[...data.details].sort((a, b) => a.sequenceNo - b.sequenceNo).map(detail => (
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
            </Card>
          ))}

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
    </View>
  );
}

const styles = StyleSheet.create({
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
  jobCard: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12, minHeight: 44 },
  pressed: { opacity: 0.75 },
});

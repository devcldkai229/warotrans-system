import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';
import {
  ArrowRight,
  BatteryMedium,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import {
  Button,
  ProgressMeter,
  StatusPill,
  Text,
} from '../../shared/ui';
import { toast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import { useRealtime } from '../../shared/realtime';
import { listJobs } from '../../shared/api';
import { AppJobItem, JOB_STATUS_PRESENTATION, mapJobDetailToAppJobItem, EMPTY_JOB } from '../jobs/jobData';
import { HomeMapPanel } from './HomeMapPanel';
import { dockReservedSpace } from '../../shared/theme/layout';
import { useMapFleet } from '../../shared/maps/hooks/useMapFleet';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const INITIAL_JOB = EMPTY_JOB;

interface MapRobot {
  id: string;
  status: 'EN_ROUTE' | 'STANDBY' | 'PAUSED' | 'UNKNOWN';
  battery: number | null;
  speed: string;
}

/**
 * Modern "Command Center" HomeScreen.
 *
 * Visual Architecture:
 *   - Background: Live Interactive 2D Warehouse Telemetry Map with AMR markers,
 *     published geometry and telemetry from the same map version.
 *   - Foreground Float: Next Handover Task card (peek sheet), with smooth
 *     expand/collapse to inspect the full fleet status.
 */
export function HomeScreen() {
  const { session } = useAuth();
  const { navigate, dockHeight } = useNavigation();
  const [peekSheetHeight, setPeekSheetHeight] = useState(0);
  const fleetQuery = useMapFleet(session?.id || '');
  const rawFleet = fleetQuery.robots;
  const [selectedRobotId, setSelectedRobotId] = useState<string>('');
  const [isFleetExpanded, setIsFleetExpanded] = useState<boolean>(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState<boolean>(false);
  const { robotTelemetry, lastJobUpdate } = useRealtime();
  const jobsQuery = useQuery({ queryKey: ['home-jobs', session?.id], queryFn: () => listJobs(), refetchInterval: 5_000 });
  const { refetch: refetchJobs } = jobsQuery;

  useEffect(() => {
    if (lastJobUpdate) void refetchJobs();
  }, [lastJobUpdate, refetchJobs]);

  const activeJob = useMemo(() => {
    const mapped = (jobsQuery.data || []).filter(job => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status))
      .map(job => mapJobDetailToAppJobItem(job, session?.id));
    const priority = (job: AppJobItem) => job.hasWaitingHandover ? 0
      : ['RECOVERY_REQUIRED', 'PAUSED'].includes(job.status) ? 1
      : job.status === 'RUNNING' ? 2 : ['QUEUED', 'CREATED'].includes(job.status) ? 3 : 4;
    return mapped.sort((a, b) => priority(a) - priority(b))[0] || INITIAL_JOB;
  }, [jobsQuery.data, session?.id]);

  const robots = useMemo<MapRobot[]>(() => rawFleet.map(robot => {
    const live = robotTelemetry[robot.code];
    const navigation = live?.navigationStatus || robot.navigationStatus;
    const battery = live?.batteryPercent ?? robot.batteryPercent;
    const velocity = live?.linearVelocity ?? robot.linearVelocity;
    return {
      id: robot.code,
      status: navigation === 'NAVIGATING' ? 'EN_ROUTE' : navigation === 'PAUSED' ? 'PAUSED'
        : navigation === 'STANDBY' ? 'STANDBY' : 'UNKNOWN',
      battery: typeof battery === 'number' ? Math.round(battery) : null,
      speed: typeof velocity === 'number' ? `${velocity.toFixed(2)} m/s` : '—',
    };
  }), [rawFleet, robotTelemetry]);

  const isWaitingHandover = Boolean(activeJob.hasWaitingHandover);
  const isQueuedOrCreated = activeJob.status === 'CREATED' || activeJob.status === 'QUEUED';
  const activeStatusLabel = isWaitingHandover ? 'Waiting Handover' : JOB_STATUS_PRESENTATION[activeJob.status]?.label || activeJob.status;
  const activePositionLabel = isWaitingHandover ? 'Waiting at Station' : isQueuedOrCreated ? 'Awaiting Robot Start' : activeJob.status === 'RUNNING' ? 'En Route' : activeJob.status;
  const collapsedBtnTitle = isWaitingHandover ? 'Verify' : isQueuedOrCreated ? 'Start' : 'Open';
  const expandedBtnTitle = isWaitingHandover ? 'Verify Handover' : isQueuedOrCreated ? 'Open & Start Job' : 'View Mission Detail';

  const toggleSheetExpand = () => {
    triggerHaptic('tap');
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setIsSheetExpanded((prev) => !prev);
  };

  const toggleFleetExpand = () => {
    triggerHaptic('tap');
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setIsFleetExpanded(!isFleetExpanded);
  };

  const handleStartHandover = () => {
    if (!activeJob.id) { navigate('jobs'); return; }
    triggerHaptic('tap');
    navigate('job_detail', { jobId: activeJob.id });
  };

  return (
    <View style={styles.root}>
      {/* 1. Full-screen Interactive 2D Facility Map */}
      <HomeMapPanel
        bottomInset={dockReservedSpace(dockHeight) + peekSheetHeight + 10}
        onOpenJobs={() => navigate('jobs')}
        fleet={rawFleet}
        updateMode={fleetQuery.updateMode}
        selectedRobotId={selectedRobotId}
        onSelectRobot={(id) => {
          setSelectedRobotId(id);
          const r = robots.find((item) => item.id === id);
          if (r) {
            toast.info(`${r.id}: Battery ${r.battery == null ? '—' : `${r.battery}%`}, Speed ${r.speed}`);
          }
        }}
        style={styles.mapCanvas}
      />

      {/* 2. Floating Next Handover Task Card (Peek Sheet) */}
      <View
        onLayout={event => setPeekSheetHeight(event.nativeEvent.layout.height)}
        style={[
          styles.peekSheetContainer,
          { bottom: dockHeight + 10 },
        ]}
      >
        <Pressable
          onPress={toggleSheetExpand}
          style={styles.cardHeaderHandle}
          accessibilityRole="button"
          accessibilityLabel={isSheetExpanded ? 'Collapse card' : 'Expand card'}
        >
          <View style={styles.dragPill} />
        </Pressable>
        {fleetQuery.isError ? <Text variant="caption" color={colors.dangerText}>Fleet could not be refreshed. Showing last reported positions.</Text> : null}

        {!activeJob.id ? <View style={styles.insetBox}>
          <Text variant="headline">{jobsQuery.isPending ? 'Loading Jobs…' : jobsQuery.isError ? 'Jobs Unavailable' : 'No Active Jobs'}</Text>
          {jobsQuery.isError ? <Text variant="body" color={colors.dangerText}>{jobsQuery.error.message}</Text> : null}
          <Button title={jobsQuery.isError ? 'Retry Jobs' : 'View Jobs'} onPress={() => { if (jobsQuery.isError) void refetchJobs(); else navigate('jobs'); }} />
        </View> : !isSheetExpanded ? (
          /* Collapsed Mode (Peek: ~68px, frees up 80% of screen for map) */
          <View style={styles.collapsedRow}>
            <Pressable
              onPress={toggleSheetExpand}
              style={styles.collapsedInfo}
              accessibilityRole="button"
              accessibilityLabel={`Job ${activeJob.jobNo || activeJob.id}, ${activeStatusLabel}. Tap to view details.`}
            >
              <View style={styles.collapsedTopLine}>
                <StatusPill status={activeJob.status} label={activeStatusLabel} size="sm" dot />
              </View>
              <View style={styles.collapsedBottomRow}>
                <Text variant="headline" color={colors.textPrimary} numberOfLines={1} style={styles.jobCode}>
                  {activeJob.jobNo || activeJob.id}
                </Text>
                <Text variant="caption" color={colors.textMuted}>·</Text>
                <Text variant="caption" color={colors.textSecondary} numberOfLines={1} style={styles.collapsedTarget}>
                  <Text style={styles.boldText}>{activeJob.target || 'Unknown Destination'}</Text> · <Text style={styles.boldMono}>{activeJob.robot || 'Unassigned'}</Text>
                </Text>
              </View>
            </Pressable>

            <View style={styles.collapsedActionGroup}>
              <Button
                title={collapsedBtnTitle}
                variant="primary"
                size="sm"
                onPress={handleStartHandover}
                icon={ArrowRight}
                iconPosition="right"
                style={styles.compactStartBtn}
              />
              <Pressable
                onPress={toggleSheetExpand}
                accessibilityRole="button"
                accessibilityLabel="Expand handover details"
                style={({ pressed }) => [styles.expandChevronBtn, pressed && styles.pressed]}
              >
                <ChevronUp size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>
        ) : (
          /* Expanded Mode: Full inspection */
          <>
            {/* Top row: Status pill + Action controls */}
            <View style={styles.expandedTopBar}>
              <StatusPill status={activeJob.status} label={activeStatusLabel} size="sm" dot />

              <View style={styles.expandedHeaderActions}>
                <Pressable
                  onPress={toggleFleetExpand}
                  accessibilityRole="button"
                  accessibilityLabel={isFleetExpanded ? 'Collapse fleet details' : 'Expand fleet details'}
                  style={({ pressed }) => [styles.fleetToggleBtn, pressed && styles.pressed]}
                >
                  <Text variant="caption" color={colors.primaryText} style={styles.fleetToggleText}>
                    {isFleetExpanded ? 'Hide Fleet' : `Fleet (${robots.length})`}
                  </Text>
                  {isFleetExpanded ? (
                    <ChevronDown size={14} color={colors.primaryText} />
                  ) : (
                    <ChevronUp size={14} color={colors.primaryText} />
                  )}
                </Pressable>

                <Pressable
                  onPress={toggleSheetExpand}
                  accessibilityRole="button"
                  accessibilityLabel="Collapse card"
                  style={({ pressed }) => [styles.collapseBtn, pressed && styles.pressed]}
                >
                  <ChevronDown size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>

            {/* Second row: Job ID with full breathing room */}
            <Text variant="headline" color={colors.textPrimary} numberOfLines={1} style={styles.jobCode}>
              {activeJob.jobNo || activeJob.id}
            </Text>

            {/* Task Details Inset Box */}
            <View style={styles.insetBox}>
              <View style={styles.detailRow}>
                <Text variant="caption" color={colors.textSecondary} style={styles.detailLabel}>Target</Text>
                <Text variant="bodyMedium" color={colors.textPrimary} style={[styles.detailValue, styles.targetValue]}>
                  {activeJob.target || 'Destination Unavailable'}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text variant="caption" color={colors.textSecondary} style={styles.detailLabel}>Cargo</Text>
                <Text variant="body" color={colors.textSecondary} style={styles.detailValue}>
                  <Text style={styles.boldMono}>{activeJob.containers[0]?.code || 'Unknown Container'}</Text>
                  {activeJob.containers.length > 1 ? ` (+${activeJob.containers.length - 1} more totes)` : ''}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text variant="caption" color={colors.textSecondary} style={styles.detailLabel}>Assigned</Text>
                <Text variant="body" color={colors.textSecondary} style={styles.detailValue}>
                  <Text style={styles.boldMono}>{activeJob.robot || 'Unassigned'}</Text> · {activePositionLabel}
                </Text>
              </View>

              <ProgressMeter
                value={activeJob.progressPercent ?? 0}
                tone="warning"
                style={styles.meter}
                accessibilityLabel={`Job progress ${activeJob.progressPercent ?? 0} percent`}
              />
            </View>

            {/* Primary Action Button */}
            <Button
              title={expandedBtnTitle}
              variant="primary"
              size="md"
              onPress={handleStartHandover}
              icon={ArrowRight}
              iconPosition="right"
              style={styles.actionBtn}
            />

            {/* Optional Expanded Fleet Details */}
            {isFleetExpanded && (
              <View style={styles.expandedFleetSection}>
                <View style={styles.fleetHeaderWithAction}>
                  <Text variant="label" color={colors.textSecondary} style={styles.fleetSectionTitle}>
                    Active Fleet Status
                  </Text>
                  <Pressable
                    onPress={() => {
                      triggerHaptic('tap');
                      navigate('fleet_recall');
                    }}
                    style={({ pressed }) => [styles.fleetRecallLink, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Open command cancellation console"
                  >
                    <ShieldAlert size={13} color="#b91c1c" />
                    <Text style={styles.fleetRecallLinkText}>
                      Command Cancellation
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.fleetRow}>
                  {robots.map((r) => (
                    <View key={r.id} style={styles.fleetItemCard}>
                      <Text variant="label" color={colors.textPrimary} style={styles.fleetRobotName} numberOfLines={1}>
                        {r.id}
                      </Text>
                      <View style={styles.statusDotRow}>
                        <View
                          style={[
                            styles.statusDot,
                            r.status === 'EN_ROUTE'
                              ? styles.statusDotRunning
                              : r.status === 'PAUSED'
                              ? styles.statusDotWarning
                              : styles.statusDotStandby,
                          ]}
                        />
                        <Text variant="caption" color={colors.textSecondary} style={styles.statusLabel}>
                          {r.status === 'EN_ROUTE' ? 'In Transit' : r.status === 'PAUSED' ? 'Paused' : r.status === 'STANDBY' ? 'Standby' : 'Unknown'}
                        </Text>
                      </View>
                      <View style={styles.fleetTelemetryRow}>
                        <Text variant="caption" color={colors.textSecondary}>Speed: {r.speed}</Text>
                        <View style={styles.batteryRow}>
                          <BatteryMedium size={13} color={r.battery != null && r.battery < 20 ? '#dc2626' : colors.successText} />
                          <Text variant="caption" color={colors.textSecondary}>{r.battery == null ? '—' : `${r.battery}%`}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#eef1f6',
    position: 'relative',
  },
  mapCanvas: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  peekSheetContainer: {
    position: 'absolute',
    left: 14,
    right: 14,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 10,
    zIndex: 70,
    ...shadows.lg,
  },
  cardHeaderHandle: {
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 2,
  },
  dragPill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  collapsedInfo: {
    flex: 1,
    gap: 3,
  },
  collapsedTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collapsedBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  collapsedTarget: {
    fontWeight: '500',
    flex: 1,
  },
  collapsedActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactStartBtn: {
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  expandChevronBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collapseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  jobCode: {
    fontWeight: '700',
    flexShrink: 0,
    marginBottom: 8,
  },
  fleetToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.full,
    backgroundColor: 'rgba(50, 53, 62, 0.08)',
  },
  fleetToggleText: {
    fontWeight: '600',
  },
  insetBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    padding: 12,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  detailLabel: {
    width: 62,
    paddingTop: 1,
    flexShrink: 0,
  },
  detailValue: {
    flex: 1,
    textAlign: 'right',
  },
  targetValue: {
    fontWeight: '700',
  },
  boldText: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  boldMono: {
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  meter: {
    marginTop: 4,
  },
  actionBtn: {
    minHeight: 48,
  },
  expandedFleetSection: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  fleetHeaderWithAction: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fleetRecallLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  fleetRecallLinkText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#b91c1c',
  },
  fleetSectionTitle: {
    fontWeight: '600',
  },
  fleetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fleetItemCard: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.sm,
    padding: 9,
    gap: 4,
    minHeight: 76,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  fleetRobotName: {
    fontWeight: '700',
    fontFamily: typography.fontMono,
    fontSize: 13,
  },
  statusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotRunning: {
    backgroundColor: '#059669',
  },
  statusDotWarning: {
    backgroundColor: '#d97706',
  },
  statusDotStandby: {
    backgroundColor: '#64748b',
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  fleetTelemetryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    marginTop: 2,
  },
  batteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  pressed: {
    opacity: 0.7,
  },
});

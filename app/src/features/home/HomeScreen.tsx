import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import {
  ArrowRight,
  BatteryMedium,
  ChevronDown,
  ChevronUp,
  Plus,
  ShieldAlert,
} from 'lucide-react-native';
import { t } from '../../shared/i18n';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import type { ThemeColors } from '../../shared/theme/colors';
import { ThemeShadows } from '../../shared/theme/shadows';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { typography } from '../../shared/theme/typography';
import {
  Button,
  ProgressMeter,
  StatusPill,
  statusTone,
  Text,
} from '../../shared/ui';
import { toast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import { useRealtime } from '../../shared/realtime';
import { getOperatingContext } from '../../shared/api/operatingContextApi';
import { homeFleetOnMap } from './homeFleet';
import { listJobs, localizeRobot } from '../../shared/api';
import { PERMISSIONS, sessionCan } from '../../shared/auth/permissions';
import { AppJobItem, JOB_STATUS_PRESENTATION, mapJobDetailToAppJobItem, EMPTY_JOB } from '../jobs/jobData';
import { HomeMapPanel } from './HomeMapPanel';
import { dockReservedSpace } from '../../shared/theme/layout';
import { useMapFleet } from '../../shared/maps/hooks/useMapFleet';


const INITIAL_JOB = EMPTY_JOB;

const WEB_SHEET_GLASS_STYLE: ViewStyle | null =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      } as unknown as ViewStyle)
    : null;

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
  const { styles, colors, isDark } = useThemedStyles(createStyles);
  const [peekSheetHeight, setPeekSheetHeight] = useState(86);
  const fleetQuery = useMapFleet(session?.id || '');
  // robot.localize: tell a robot where it stands after power-on; the snapshot refresh shows LOCALIZED when it converged.
  const onLocalizeRobot = sessionCan(session, PERMISSIONS.robotLocalize)
    ? async (robotId: string, endpointId: string) => { await localizeRobot(robotId, endpointId); toast.success('Localize command accepted.'); void fleetQuery.refetch(); }
    : undefined;
  const onManualDrive = sessionCan(session, PERMISSIONS.robotManualDrive)
    ? (robotId: string) => navigate('manual_drive', { robotId })
    : undefined;
  const rawFleet = fleetQuery.robots;
  const onlineFleet = useMemo(() => rawFleet.filter(robot => robot.isOnline), [rawFleet]);
  const [selectedRobotId, setSelectedRobotId] = useState<string>('');
  const [isFleetExpanded, setIsFleetExpanded] = useState<boolean>(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState<boolean>(false);
  const { lastJobUpdate } = useRealtime();
  const operating = useQuery({ queryKey: ['operating-context'], queryFn: () => getOperatingContext(), staleTime: 0, refetchInterval: 30_000 });
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

  const fleetUpdateMode = fleetQuery.isError || fleetQuery.isPaused ? 'unavailable' : fleetQuery.updateMode;
  const fleetStatusCurrent = fleetUpdateMode !== 'unavailable' && fleetUpdateMode !== 'paused';
  const robots = useMemo(() => homeFleetOnMap(onlineFleet, operating.data, fleetUpdateMode), [onlineFleet, operating.data, fleetUpdateMode]);
  const activeRobotCount = robots.filter(robot => robot.active).length;
  const fleetCountLabel = operating.data ? `${fleetStatusCurrent ? activeRobotCount : '—'}/${robots.length}` : '…';

  useEffect(() => {
    if (selectedRobotId && !onlineFleet.some(robot => robot.code === selectedRobotId)) {
      setSelectedRobotId('');
    }
  }, [onlineFleet, selectedRobotId]);

  const canCreateTransport = sessionCan(session, PERMISSIONS.transportCreate);
  const hasActiveJob = Boolean(activeJob.id);

  const isWaitingHandover = Boolean(activeJob.hasWaitingHandover);
  const isQueuedOrCreated = activeJob.status === 'CREATED' || activeJob.status === 'QUEUED';
  const activeStatusLabel = isWaitingHandover ? 'Waiting Handover' : JOB_STATUS_PRESENTATION[activeJob.status]?.label || activeJob.status;
  const activePositionLabel = isWaitingHandover ? 'Waiting at Station' : isQueuedOrCreated ? 'Awaiting Start' : activeJob.status === 'RUNNING' ? 'En Route' : activeJob.status;
  const collapsedBtnTitle = isWaitingHandover ? 'Verify' : isQueuedOrCreated ? 'Start' : 'Open';
  const expandedBtnTitle = isWaitingHandover ? 'Verify Handover' : isQueuedOrCreated ? 'Open & Start Job' : 'View Job Detail';

  const collapsedTone = statusTone(isWaitingHandover ? 'WAITING_HANDOVER' : activeJob.status);
  const collapsedStatusDotColor =
    collapsedTone === 'danger'
      ? colors.danger
      : collapsedTone === 'warning'
      ? colors.warning
      : collapsedTone === 'info'
      ? colors.primary
      : collapsedTone === 'success'
      ? isDark
        ? '#30D158'
        : '#34C759'
      : colors.textMuted;

  const emptyStatusDotColor = jobsQuery.isError
    ? colors.danger
    : !jobsQuery.isPending && fleetStatusCurrent && activeRobotCount > 0
    ? isDark
      ? '#30D158'
      : '#34C759'
    : colors.textMuted;
  const emptyHeadline = jobsQuery.isPending
    ? 'Loading Jobs…'
    : jobsQuery.isError
    ? 'Jobs Unavailable'
    : 'No Active Jobs';
  const emptySubtitle = jobsQuery.isError
    ? jobsQuery.error.message
    : jobsQuery.isPending
    ? 'Checking active tasks…'
    : !fleetStatusCurrent
    ? 'Live status unavailable'
    : activeRobotCount === 0
    ? 'No online robots on this map'
    : activeRobotCount === 1
    ? '1 robot online'
    : t('{count} robots online', { count: activeRobotCount });

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

  const destructiveColor = isDark ? '#FF453A' : '#DC2626';

  return (
    <View style={styles.root}>
      {/* 1. Full-screen Interactive 2D Facility Map */}
      <HomeMapPanel
        bottomInset={dockReservedSpace(dockHeight) + peekSheetHeight + 10}
        onOpenJobs={() => navigate('jobs')}
        fleet={onlineFleet}
        updateMode={fleetQuery.updateMode}
        jobContext={activeJob.id ? {
          jobId: activeJob.id,
          status: activeJob.status,
          robotId:
            onlineFleet.find(
              r => r.code === activeJob.robot || r.id === activeJob.robot,
            )?.id ?? null,
          pickupCode: activeJob.sourceEndpointCode,
          dropoffCode: activeJob.destinationEndpointCode,
          robotCode: activeJob.robot,
        } : undefined}
        jobMapVersionId={activeJob.id ? activeJob.mapVersionId : undefined}
        onLocalizeRobot={onLocalizeRobot}
        onManualDrive={onManualDrive}
        selectedRobotId={selectedRobotId}
        onSelectRobot={(id) => {
          setSelectedRobotId(id);
        }}
        style={styles.mapCanvas}
      />

      {/* 2. Floating Next Handover Task Card (Peek Sheet) */}
      <View
        onLayout={event => {
          if (!isSheetExpanded || !hasActiveJob) {
            setPeekSheetHeight(event.nativeEvent.layout.height);
          }
        }}
        style={[
          styles.peekSheetContainer,
          !hasActiveJob && styles.peekSheetCompact,
          WEB_SHEET_GLASS_STYLE,
          { bottom: dockHeight + 10 },
        ]}
      >
        {hasActiveJob ? (
          <Pressable
            onPress={toggleSheetExpand}
            style={styles.cardHeaderHandle}
            accessibilityRole="button"
            accessibilityLabel={isSheetExpanded ? 'Collapse card' : 'Expand card'}
          >
            <View style={styles.dragPill} />
          </Pressable>
        ) : null}
        {fleetQuery.isError ? <Text variant="caption" color={colors.dangerText}>Fleet could not be refreshed. Showing last reported positions.</Text> : null}

        {!hasActiveJob ? (
          <View style={styles.collapsedRow}>
            <View style={styles.collapsedInfo}>
              <View style={styles.collapsedTopLine}>
                <View style={[styles.collapsedStatusDot, { backgroundColor: emptyStatusDotColor }]} />
                <Text variant="headline" color={colors.textPrimary} numberOfLines={1} style={styles.collapsedJobCode}>
                  {emptyHeadline}
                </Text>
              </View>
              <Text
                variant="caption"
                color={jobsQuery.isError ? colors.dangerText : colors.textSecondary}
                numberOfLines={1}
                style={styles.collapsedTarget}
              >
                {emptySubtitle}
              </Text>
            </View>

            {jobsQuery.isError ? (
              <Button
                title="Retry"
                variant="primary"
                size="sm"
                onPress={() => {
                  triggerHaptic('tap');
                  void refetchJobs();
                }}
                style={styles.compactStartBtn}
              />
            ) : canCreateTransport ? (
              <Button
                title="Create Request"
                variant="primary"
                size="sm"
                icon={Plus}
                iconPosition="left"
                onPress={() => {
                  triggerHaptic('tap');
                  navigate('transport_create');
                }}
                style={styles.compactStartBtn}
              />
            ) : (
              <Button
                title="View Jobs"
                variant="secondary"
                size="sm"
                icon={ArrowRight}
                iconPosition="right"
                onPress={() => {
                  triggerHaptic('tap');
                  navigate('jobs');
                }}
                style={styles.compactStartBtn}
              />
            )}
          </View>
        ) : !isSheetExpanded ? (
          /* Collapsed Mode: crisp 2-line preview + primary CTA */
          <View style={styles.collapsedRow}>
            <Pressable
              onPress={toggleSheetExpand}
              style={styles.collapsedInfo}
              accessibilityRole="button"
              accessibilityLabel={`Job ${activeJob.jobNo || activeJob.id}, ${activeStatusLabel}. Tap to view details.`}
            >
              <View style={styles.collapsedTopLine}>
                <View style={[styles.collapsedStatusDot, { backgroundColor: collapsedStatusDotColor }]} />
                <Text variant="headline" color={colors.textPrimary} numberOfLines={1} style={styles.collapsedJobCode}>
                  {activeJob.jobNo || activeJob.id}
                </Text>
              </View>
              <Text variant="caption" color={colors.textSecondary} numberOfLines={1} style={styles.collapsedTarget}>
                {activeStatusLabel}
                {' · '}
                {activeJob.target || 'Unknown Destination'}
                {activeJob.robot ? (
                  <>
                    {' · '}
                    <Text style={styles.collapsedRobotMono}>{activeJob.robot}</Text>
                  </>
                ) : null}
              </Text>
            </Pressable>

            <Button
              title={collapsedBtnTitle}
              variant="primary"
              size="sm"
              onPress={handleStartHandover}
              icon={ArrowRight}
              iconPosition="right"
              style={styles.compactStartBtn}
            />
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
                  <Text variant="caption" color={colors.textPrimary} style={styles.fleetToggleText}>
                    {isFleetExpanded ? 'Hide Fleet' : `Fleet (${fleetCountLabel})`}
                  </Text>
                  {isFleetExpanded ? (
                    <ChevronDown size={14} color={colors.textPrimary} />
                  ) : (
                    <ChevronUp size={14} color={colors.textPrimary} />
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

            {/* Task Details Inset Grouped Card */}
            <View style={styles.insetBox}>
              <View style={styles.detailRow}>
                <Text variant="caption" color={colors.textSecondary} style={styles.detailLabel}>Target</Text>
                <Text variant="bodyMedium" color={colors.textPrimary} style={[styles.detailValue, styles.targetValue]}>
                  {activeJob.target || 'Destination Unavailable'}
                </Text>
              </View>

              <View style={styles.insetDivider} />

              <View style={styles.detailRow}>
                <Text variant="caption" color={colors.textSecondary} style={styles.detailLabel}>Cargo</Text>
                <Text variant="body" color={colors.textSecondary} style={styles.detailValue}>
                  <Text style={styles.boldMono}>{activeJob.containers[0]?.code || 'Unknown Container'}</Text>
                  {activeJob.containers.length > 1 ? ` (+${activeJob.containers.length - 1} more totes)` : ''}
                </Text>
              </View>

              <View style={styles.insetDivider} />

              <View style={styles.detailRow}>
                <Text variant="caption" color={colors.textSecondary} style={styles.detailLabel}>Assigned</Text>
                <Text variant="body" color={colors.textSecondary} numberOfLines={1} style={styles.detailValue}>
                  <Text style={styles.boldMono}>{activeJob.robot || 'Unassigned'}</Text> · {activePositionLabel}
                </Text>
              </View>

              {!isQueuedOrCreated || (activeJob.progressPercent ?? 0) > 0 ? (
                <View style={styles.meterRow}>
                  <ProgressMeter
                    value={activeJob.progressPercent ?? 0}
                    tone="warning"
                    style={styles.meter}
                    accessibilityLabel={`Job progress ${activeJob.progressPercent ?? 0} percent`}
                  />
                </View>
              ) : null}
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
                {(operating.isPending || operating.error || !fleetStatusCurrent) ? (
                  <Text variant="caption" color={colors.textSecondary}>
                    {operating.isPending
                      ? 'Loading Fleet Context…'
                      : operating.error
                      ? 'Fleet context could not be refreshed.'
                      : `${robots.length} Registered · ${fleetUpdateMode === 'paused' ? 'Updates Paused' : 'Live Status Unavailable'}`}
                  </Text>
                ) : null}
                {!operating.isPending && !operating.error && !robots.length ? (
                  <Text variant="caption">No robots are registered on this map.</Text>
                ) : null}
                <View style={styles.fleetRow}>
                  {robots.map((r) => {
                    const isSelected = selectedRobotId === r.id;
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => {
                          triggerHaptic('tap');
                          setSelectedRobotId(prev => (prev === r.id ? '' : r.id));
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`Select robot ${r.id}`}
                        style={({ pressed }) => [
                          styles.fleetItemCard,
                          isSelected && styles.fleetItemCardSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.fleetCardTop}>
                          <Text variant="label" color={colors.textPrimary} style={styles.fleetRobotName} numberOfLines={1}>
                            {r.id}
                          </Text>
                          <View style={styles.batteryRow}>
                            <BatteryMedium
                              size={13}
                              color={r.battery != null && r.battery < 20 ? colors.dangerText : colors.successText}
                            />
                            <Text variant="caption" color={colors.textSecondary} style={styles.fleetSpeedText}>
                              {r.battery == null ? '--' : `${r.battery}%`}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.fleetCardBottom}>
                          <View style={styles.statusDotRow}>
                            <View
                              style={[
                                styles.statusDot,
                                { backgroundColor: r.tone === 'danger' ? colors.dangerText : r.tone === 'warning' ? colors.warningText
                                  : r.tone === 'success' ? colors.successText : r.tone === 'info' ? colors.primaryText : colors.textMuted },
                              ]}
                            />
                            <Text variant="caption" color={colors.textSecondary} style={styles.statusLabel} numberOfLines={1}>
                              {r.statusLabel}
                            </Text>
                          </View>
                          <Text variant="caption" color={colors.textMuted} style={styles.fleetSpeedText} numberOfLines={1}>
                            {r.speed}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable
                  onPress={() => {
                    triggerHaptic('tap');
                    navigate('fleet_recall');
                  }}
                  style={({ pressed }) => [
                    styles.fleetRecallLink,
                    pressed && styles.fleetRecallLinkPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel active robot commands"
                >
                  <ShieldAlert size={14} color={destructiveColor} />
                  <Text color={destructiveColor} style={styles.fleetRecallLinkText}>
                    Cancel Commands
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows, isDark: boolean) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
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
    backgroundColor: isDark ? 'rgba(28, 30, 34, 0.92)' : 'rgba(255, 255, 255, 0.92)',
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(18, 19, 23, 0.08)',
    paddingHorizontal: 16,
    paddingTop: 7,
    paddingBottom: 12,
    gap: 8,
    zIndex: 70,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: isDark ? 0.42 : 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
  cardHeaderHandle: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  dragPill: {
    width: 34,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(18, 19, 23, 0.16)',
  },
  peekSheetCompact: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  collapsedInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  collapsedTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
  },
  collapsedStatusDot: {
    width: 6.5,
    height: 6.5,
    borderRadius: 3.25,
    flexShrink: 0,
  },
  collapsedJobCode: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: '700',
    letterSpacing: -0.25,
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
  },
  collapsedTarget: {
    fontSize: 12,
    lineHeight: 16,
  },
  collapsedRobotMono: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontMono,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  compactStartBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexShrink: 0,
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
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(18, 19, 23, 0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(18, 19, 23, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  jobCode: {
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: -0.3,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  fleetToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(18, 19, 23, 0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(18, 19, 23, 0.08)',
  },
  fleetToggleText: {
    fontWeight: '600',
  },
  insetBox: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(18, 19, 23, 0.035)',
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(18, 19, 23, 0.07)',
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9.5,
  },
  insetDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 12,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(18, 19, 23, 0.07)',
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
  boldMono: {
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  meterRow: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 2,
  },
  meter: {
    marginTop: 2,
  },
  actionBtn: {
    minHeight: 46,
  },
  expandedFleetSection: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(18, 19, 23, 0.08)',
    gap: 8,
  },
  fleetRecallLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderCurve: 'continuous',
    backgroundColor: 'transparent',
  },
  fleetRecallLinkPressed: {
    backgroundColor: isDark ? 'rgba(255, 69, 58, 0.14)' : 'rgba(220, 38, 38, 0.08)',
  },
  fleetRecallLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },
  fleetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fleetItemCard: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 0,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(18, 19, 23, 0.035)',
    borderRadius: 11,
    borderCurve: 'continuous',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    minHeight: 56,
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(18, 19, 23, 0.07)',
  },
  fleetItemCardSelected: {
    borderWidth: 1,
    borderColor: colors.textPrimary,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.09)' : colors.surface,
  },
  fleetCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  fleetCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  fleetRobotName: {
    flexShrink: 1,
    fontWeight: '700',
    fontFamily: typography.fontMono,
    fontVariant: ['tabular-nums'],
    fontSize: 13,
  },
  statusDotRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 11.5,
    flexShrink: 1,
    fontWeight: '600',
  },
  fleetSpeedText: {
    fontSize: 11,
    fontFamily: typography.fontMono,
    fontVariant: ['tabular-nums'],
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

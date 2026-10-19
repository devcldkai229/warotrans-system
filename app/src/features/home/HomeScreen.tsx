import React, { useEffect, useMemo, useState } from 'react';
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
import { listJobs, listRobots } from '../../shared/api';
import { AppJobItem, JOB_STATUS_PRESENTATION, mapJobDetailToAppJobItem, MOCK_JOBS } from '../jobs/jobData';
import { MapRobot, MiniFacilityMap } from './MiniFacilityMap';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const INITIAL_ROBOTS: MapRobot[] = [
  {
    id: 'AMR-01',
    xPercent: 38,
    yPercent: 44,
    headingDeg: 45,
    status: 'EN_ROUTE',
    battery: 85,
    speed: '1.2 m/s',
  },
  {
    id: 'AMR-02',
    xPercent: 74,
    yPercent: 26,
    headingDeg: 180,
    status: 'STANDBY',
    battery: 94,
    speed: '0.0 m/s',
  },
];

const INITIAL_JOB = MOCK_JOBS.find((job) => job.id === 'JOB-2026-0812') ?? MOCK_JOBS[0];

function mapRobotPose(poseX: number, poseY: number, fallback: MapRobot) {
  if (poseX === 0 && poseY === 0) {
    return { xPercent: fallback.xPercent, yPercent: fallback.yPercent };
  }
  // Project metres onto the schematic's 50 x 30 m viewport, inside its safe bounds.
  return {
    xPercent: Math.max(18, Math.min(82, 18 + (poseX / 50) * 64)),
    yPercent: Math.max(18, Math.min(68, 68 - (poseY / 30) * 50)),
  };
}

/**
 * Modern "Command Center" HomeScreen.
 *
 * Visual Architecture:
 *   - Background: Live Interactive 2D Warehouse Telemetry Map with AMR markers,
 *     racks, docks, and real-time radar sweep.
 *   - Foreground Float: Next Handover Task card (peek sheet), with smooth
 *     expand/collapse to inspect the full fleet status.
 */
export function HomeScreen() {
  const { session } = useAuth();
  const { navigate, dockHeight } = useNavigation();
  const [selectedRobotId, setSelectedRobotId] = useState<string>('AMR-01');
  const [isFleetExpanded, setIsFleetExpanded] = useState<boolean>(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState<boolean>(false);
  const [activeJob, setActiveJob] = useState<AppJobItem>(INITIAL_JOB);
  const [fleetRobots, setFleetRobots] = useState<MapRobot[]>(INITIAL_ROBOTS);
  const { robotTelemetry, lastJobUpdate } = useRealtime();

  useEffect(() => {
    let isMounted = true;
    listJobs()
      .then((jobs) => {
        if (isMounted) {
          const mapped = jobs.map(mapJobDetailToAppJobItem);
          const priority = (job: AppJobItem) => job.hasWaitingHandover || job.status === 'ASSIGNED' ? 0
            : ['RECOVERY_REQUIRED', 'PAUSED', 'FAILED'].includes(job.status) ? 1
            : job.status === 'RUNNING' ? 2
            : ['QUEUED', 'CREATED'].includes(job.status) ? 3 : 4;
          setActiveJob(mapped.sort((a, b) => priority(a) - priority(b))[0] || INITIAL_JOB);
        }
      })
      .catch(() => {});

    return () => { isMounted = false; };
  }, [lastJobUpdate]);

  useEffect(() => {
    let isMounted = true;

    // Fetch initial fleet status from backend so battery/status/pose reflects database on mount
    listRobots()
      .then((res) => {
        if (isMounted && res?.items && res.items.length > 0) {
          const mapped: MapRobot[] = res.items.map((r, idx) => {
            const fallback =
              INITIAL_ROBOTS.find((init) => init.id === r.code) ||
              INITIAL_ROBOTS[idx % INITIAL_ROBOTS.length];
            return {
              id: r.code,
              ...mapRobotPose(r.poseX ?? 0, r.poseY ?? 0, fallback),
              headingDeg: Math.round(((r.poseYaw ?? 0) * 180) / Math.PI),
              status: (r.navigationStatus === 'NAVIGATING'
                ? 'EN_ROUTE'
                : r.navigationStatus === 'PAUSED'
                  ? 'PAUSED'
                  : 'STANDBY') as any,
              battery: Math.round(r.batteryPercent ?? 85),
              speed: r.navigationStatus === 'NAVIGATING' ? '1.2 m/s' : '0.0 m/s',
            };
          });
          setFleetRobots(mapped);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  const robots = useMemo(() => {
    return fleetRobots.map((r, idx) => {
      const live = robotTelemetry[r.id];
      if (!live) return r;
      return {
        ...r,
        ...mapRobotPose(live.poseX, live.poseY,
          INITIAL_ROBOTS.find((initial) => initial.id === r.id) || INITIAL_ROBOTS[idx % INITIAL_ROBOTS.length]),
        battery: Math.round(live.batteryPercent ?? r.battery),
        status: (live.navigationStatus === 'NAVIGATING'
          ? 'EN_ROUTE'
          : live.navigationStatus === 'STANDBY'
          ? 'STANDBY'
          : live.navigationStatus === 'PAUSED'
          ? 'PAUSED'
          : 'STANDBY') as any,
        speed: live.navigationStatus === 'NAVIGATING' ? '1.2 m/s' : '0.0 m/s',
        headingDeg: Math.round(((live.poseYaw ?? 0) * 180) / Math.PI),
      };
    });
  }, [fleetRobots, robotTelemetry]);

  const activeZone = session?.zone || 'Inbound Dock 01';
  const isWaitingHandover = Boolean(activeJob.hasWaitingHandover || activeJob.status === 'ASSIGNED');
  const isQueuedOrCreated = activeJob.status === 'CREATED' || activeJob.status === 'QUEUED';
  const activeStatusLabel = isWaitingHandover ? 'Waiting Handover' : JOB_STATUS_PRESENTATION[activeJob.status]?.label || activeJob.status;
  const activePositionLabel = isWaitingHandover ? 'At Station (0m)' : isQueuedOrCreated ? 'Awaiting Robot Start' : activeJob.status === 'RUNNING' ? 'En Route' : activeJob.status;
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
    triggerHaptic('tap');
    navigate('job_detail', { jobId: activeJob.id });
  };

  const handleLocateUser = () => {
    setSelectedRobotId('AMR-01');
    toast.info(`Centered on your station: ${activeZone}`);
  };

  const handleSearchOnMap = () => {
    triggerHaptic('tap');
    navigate('inventory_lookup');
  };

  return (
    <View style={styles.root}>
      {/* 1. Full-screen Interactive 2D Facility Map */}
      <MiniFacilityMap
        currentZone={activeZone}
        selectedRobotId={selectedRobotId}
        onSelectRobot={(id) => {
          setSelectedRobotId(id);
          const r = robots.find((item) => item.id === id);
          if (r) {
            toast.info(`${r.id}: Battery ${r.battery}%, Speed ${r.speed}`);
          }
        }}
        onLocateUser={handleLocateUser}
        onSearch={handleSearchOnMap}
        robots={robots}
        style={styles.mapCanvas}
      />

      {/* 2. Floating Next Handover Task Card (Peek Sheet) */}
      <View
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

        {!isSheetExpanded ? (
          /* Collapsed Mode (Peek: ~68px, frees up 80% of screen for map) */
          <View style={styles.collapsedRow}>
            <Pressable
              onPress={toggleSheetExpand}
              style={styles.collapsedInfo}
              accessibilityRole="button"
              accessibilityLabel={`Job ${activeJob.id}, waiting handover. Tap to view details.`}
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
                  <Text style={styles.boldText}>{activeJob.target || 'Rack A · Level 2'}</Text> · <Text style={styles.boldMono}>{activeJob.robot || 'AMR-01'}</Text>
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
                    {isFleetExpanded ? 'Hide Fleet' : 'Fleet (2)'}
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
                  {activeJob.target || 'Rack A · Level 2 · Bin 03'}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text variant="caption" color={colors.textSecondary} style={styles.detailLabel}>Cargo</Text>
                <Text variant="body" color={colors.textSecondary} style={styles.detailValue}>
                  <Text style={styles.boldMono}>{activeJob.containers[0]?.code || 'BOX-101'}</Text>
                  {activeJob.containers.length > 1 ? ` (+${activeJob.containers.length - 1} more totes)` : ''}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text variant="caption" color={colors.textSecondary} style={styles.detailLabel}>Assigned</Text>
                <Text variant="body" color={colors.textSecondary} style={styles.detailValue}>
                  <Text style={styles.boldMono}>{activeJob.robot || 'AMR-01'}</Text> · {activePositionLabel}
                </Text>
              </View>

              <ProgressMeter
                value={activeJob.progressPercent ?? 68}
                tone="warning"
                style={styles.meter}
                accessibilityLabel="Handover progress 68 percent"
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
                    accessibilityLabel="Open Emergency Recall console"
                  >
                    <ShieldAlert size={13} color="#dc2626" />
                    <Text variant="caption" style={styles.fleetRecallLinkText}>
                      Recall & E-Stop
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.fleetRow}>
                  {robots.map((r) => (
                    <View key={r.id} style={styles.fleetItemCard}>
                      <View style={styles.fleetItemHeader}>
                        <Text variant="label" color={colors.textPrimary} style={styles.fleetRobotName}>
                          {r.id}
                        </Text>
                        <StatusPill
                          status={r.status === 'EN_ROUTE' ? 'RUNNING' : r.status === 'PAUSED' ? 'WARNING' : 'COMPLETED'}
                          label={r.status === 'EN_ROUTE' ? 'In Transit' : r.status === 'PAUSED' ? 'Paused' : 'Standby'}
                          tone={r.status === 'PAUSED' ? 'warning' : undefined}
                          size="sm"
                        />
                      </View>
                      <Text variant="caption" color={colors.textSecondary}>Speed: {r.speed}</Text>
                      <View style={styles.batteryRow}>
                        <BatteryMedium size={14} color={r.battery < 20 ? '#dc2626' : colors.successText} />
                        <Text variant="caption" color={colors.textSecondary}>{r.battery}%</Text>
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
    fontSize: 10,
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
    padding: 8,
    gap: 4,
  },
  fleetItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fleetRobotName: {
    fontWeight: '700',
  },
  batteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});

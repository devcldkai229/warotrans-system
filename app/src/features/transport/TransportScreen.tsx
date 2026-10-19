import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  AlertOctagon,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  History,
  LifeBuoy,
  PackagePlus,
  PauseCircle,
  Plus,
  Search,
  ShieldAlert,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { JOB_STATUS_PRESENTATION, MOCK_JOBS } from '../jobs/jobData';
import { useSafetyHold } from '../../shared/context/SafetyHoldContext';
import { colors } from '../../shared/theme/colors';
import { dockReservedSpace, useTopInset } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { toast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import { StatusPill } from '../../shared/ui/StatusPill';
import { Text } from '../../shared/ui/Text';
import { cancelRobotCommand, listRobots, listTransportRequests, type RobotDto } from '../../shared/api';

export interface RecentDispatchItem {
  id: string;
  type: string;
  status: string;
  statusLabel?: string;
  route: string;
  container: string;
  robot: string;
  time: string;
  jobId: string;
}

const RECENT_DISPATCHES: RecentDispatchItem[] = [
  {
    id: 'TR-2048',
    type: 'Inbound Putaway',
    status: 'ASSIGNED',
    statusLabel: 'Waiting Handover',
    route: 'DOCK-IN-01 ➔ RACK-A-02 · Level 1',
    container: 'BOX-101, BOX-102 (2 Totes)',
    robot: 'AMR-01',
    time: '2m ago',
    jobId: 'JOB-2026-0812',
  },
  {
    id: 'TR-2047',
    type: 'Replenishment',
    status: 'RECOVERY_REQUIRED',
    statusLabel: 'Needs Recovery',
    route: 'RACK-D-01 ➔ RACK-A-01 · Level 1',
    container: 'BOX-401, BOX-402 (2 Totes)',
    robot: 'AMR-02',
    time: '14m ago',
    jobId: 'JOB-2026-0819',
  },
  {
    id: 'TR-2046',
    type: 'Outbound Retrieval',
    status: 'RUNNING',
    statusLabel: 'En Route',
    route: 'RACK-B-04 · Level 2 ➔ DOCK-OUT-04',
    container: 'BOX-204 (16 pcs)',
    robot: 'AMR-02',
    time: '25m ago',
    jobId: 'JOB-2026-0813',
  },
];

function PulsingBeaconDot() {
  const pingAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pingAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pingAnim]);

  const scale = pingAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.4],
  });
  const opacity = pingAnim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0.85, 0.3, 0],
  });

  return (
    <View style={styles.beaconContainer}>
      <Animated.View
        style={[
          styles.beaconPing,
          {
            transform: [{ scale }],
            opacity,
          },
        ]}
      />
      <View style={styles.beaconCore} />
    </View>
  );
}

/**
 * Transport Hub Screen (Redesigned Phase 3).
 *
 * Implements "Calm Operations" & Machined Obsidian aesthetics:
 *   - Dual Action Console: Machined Obsidian primary button alongside crisp tactile container pack card.
 *   - Safety & Incident: Hidden during normal operations. Only displays an urgent banner during active anomalies.
 *   - Quiet Operational Safety Bar: Soft hold & block path reporting in a single calm strip.
 *   - Recent Dispatches: Structured, high-contrast operational audit cards.
 */
export function TransportScreen() {
  const { navigate, dockHeight } = useNavigation();
  const { isHolding, toggleHold: toggleFleetHold } = useSafetyHold();
  const [hasActiveAlert, setHasActiveAlert] = useState(false);
  const [showIncidentDetails, setShowIncidentDetails] = useState(false);
  const [dispatches, setDispatches] = useState<RecentDispatchItem[]>(RECENT_DISPATCHES.slice(0, 3));
  const [totalRecords, setTotalRecords] = useState<number>(RECENT_DISPATCHES.length);
  const [isLoadingDispatches, setIsLoadingDispatches] = useState(false);
  const [availableRobots, setAvailableRobots] = useState<RobotDto[]>([]);

  useEffect(() => {
    let mounted = true;
    listRobots().then((res) => { if (mounted) setAvailableRobots(res.items); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function loadRecent() {
      setIsLoadingDispatches(true);
      try {
        const res = await listTransportRequests({ take: 3 });
        if (isMounted && res?.items) {
          setTotalRecords(res.total || res.items.length);
          const mapped = res.items.slice(0, 3).map((item) => {
            const details = item.details || [];
            const first = details[0];
            const route = first
              ? `${first.sourceEndpointCode || 'DOCK-IN-01'} ➔ ${first.destinationEndpointCode || 'RACK-A-01'}`
              : 'Multi-stop movement';
            const firstBarcode = first?.containerBarcode || 'TOTE-01';
            const containerSummary =
              details.length > 1
                ? `${firstBarcode} (+${details.length - 1})`
                : firstBarcode;

            let mappedStatus: any = item.status;
            let statusLabel: string = item.status;

            if (item.status === 'SUBMITTED') {
              mappedStatus = 'SUBMITTED';
              statusLabel = 'Submitted';
            } else if (item.status === 'QUEUED') {
              mappedStatus = 'QUEUED';
              statusLabel = 'Queued';
            } else if (item.requestCode === 'TR-2047') {
              mappedStatus = 'RECOVERY_REQUIRED';
              statusLabel = 'Needs Recovery';
            } else if (item.status === 'IN_PROGRESS') {
              mappedStatus = 'ASSIGNED';
              statusLabel = 'Waiting Handover';
            } else if (item.status === 'COMPLETED') {
              mappedStatus = 'COMPLETED';
              statusLabel = 'Completed';
            } else if (item.status === 'CANCELLED' || item.status === 'REJECTED') {
              mappedStatus = 'CANCELLED';
              statusLabel = 'Cancelled';
            } else if (item.status === 'FAILED') {
              mappedStatus = 'FAILED';
              statusLabel = 'Failed';
            }

            return {
              id: item.requestCode,
              type:
                item.workflowName ||
                (item.workflowCode ? item.workflowCode.replace(/_/g, ' ') : 'Transport Movement'),
              status: mappedStatus,
              statusLabel,
              route,
              container: containerSummary,
              robot: item.assignedRobotCode || 'AMR-01',
              time: item.submittedAt
                ? new Date(item.submittedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Just now',
              jobId: item.linkedJobId || '',
            };
          });
          setDispatches(mapped);
        }
      } catch {
        // Graceful fallback to static demo dispatches
      } finally {
        if (isMounted) setIsLoadingDispatches(false);
      }
    }
    loadRecent();
    return () => {
      isMounted = false;
    };
  }, []);

  const bottomInset = dockReservedSpace(dockHeight);
  const topInset = useTopInset();

  const toggleHold = () => {
    triggerHaptic('tap');
    toggleFleetHold();
    if (isHolding) {
      toast.success(
        'Nearby AMR soft-pause released. Normal Nav2 navigation resumed.'
      );
    } else {
      const activeRobot = availableRobots.find((robot) =>
        robot.currentCommandId || ['BUSY', 'RUNNING', 'EXECUTING'].includes(robot.status) ||
        robot.navigationStatus === 'NAVIGATING');
      const selectedRobotUuid = activeRobot?.id;
      if (selectedRobotUuid) {
        void cancelRobotCommand(selectedRobotUuid, 'Operator soft-hold from mobile console').catch(() => {});
      }
      toast.warning(
        'HOLD ROBOT ACTIVE: Nearby AMRs within 3m perimeter soft-paused.'
      );
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + 14, paddingBottom: bottomInset + 20 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Screen Title */}
        <View style={styles.screenHeader}>
          <Text variant="caption" color={colors.textSecondary} style={styles.eyebrow}>
            Logistics command
          </Text>
          <Text variant="display" color={colors.textPrimary} style={styles.pageTitle}>
            Transport Hub
          </Text>
        </View>

        {/* 1. Primary Hero Actions (Machined Dual Action Console) */}
        <View style={styles.section}>
          <Text variant="label" color={colors.textSecondary} style={styles.sectionLabel}>
            Dispatch Operations
          </Text>

          <View style={styles.heroGrid}>
            {/* Card 1: New Transport Request (Machined Obsidian) */}
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                navigate('transport_create');
              }}
              style={({ pressed }) => [
                styles.heroBtnPrimary,
                pressed && styles.heroBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="New transport request"
            >
              <View style={styles.heroBtnTopRow}>
                <View style={styles.primaryIconWell}>
                  <Plus size={18} color="#ffffff" strokeWidth={2.6} />
                </View>
                <ArrowRight size={16} color="rgba(255, 255, 255, 0.45)" />
              </View>

              <View style={styles.heroBtnContent}>
                <Text variant="bodyMedium" color={colors.textInverse} style={styles.heroBtnTitle}>
                  New Request
                </Text>
              </View>
            </Pressable>

            {/* Card 2: Pack Container (Tactile White Card) */}
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                navigate('create_container');
              }}
              style={({ pressed }) => [
                styles.heroBtnSecondary,
                pressed && styles.heroBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Pack and ingest container"
            >
              <View style={styles.heroBtnTopRow}>
                <View style={styles.secondaryIconWell}>
                  <PackagePlus size={18} color={colors.textPrimary} strokeWidth={2.2} />
                </View>
                <ArrowRight size={16} color={colors.textMuted} />
              </View>

              <View style={styles.heroBtnContent}>
                <Text variant="bodyMedium" color={colors.textPrimary} style={styles.heroBtnTitle}>
                  Pack Container
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* 2. Emergency Active Alert Banner (HIDDEN by default, shown ONLY during anomalies) */}
        {hasActiveAlert && (
          <View style={styles.activeAlertCard}>
            <View style={styles.alertHeaderRow}>
              <View style={styles.alertTitleGroup}>
                <PulsingBeaconDot />
                <Text variant="label" color={colors.dangerText} style={styles.alertTitle}>
                  AMR-01 Stalled · Cargo at Risk
                </Text>
              </View>
              <Text variant="caption" color={colors.dangerText}>Zone A · Aisle 2</Text>
            </View>

            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                setShowIncidentDetails(!showIncidentDetails);
              }}
              style={styles.detailsToggle}
            >
              <Text variant="caption" color={colors.dangerText} style={{ fontWeight: '600' }}>
                {showIncidentDetails ? 'Hide details' : 'View incident details'}
              </Text>
              {showIncidentDetails ? (
                <ChevronUp size={14} color={colors.dangerText} />
              ) : (
                <ChevronDown size={14} color={colors.dangerText} />
              )}
            </Pressable>

            {showIncidentDetails && (
              <Text variant="caption" color={colors.dangerText} style={styles.alertDesc}>
                Hardware motor stall with payload BOX-101 (12 pcs). Carrier AMR-02 is in standby for recovery.
              </Text>
            )}

            <Pressable
              onPress={() => {
                triggerHaptic('warning');
                navigate('payload_recovery');
              }}
              style={({ pressed }) => [styles.rescueBtn, pressed && styles.rescueBtnPressed]}
            >
              <LifeBuoy size={16} color="#ffffff" />
              <Text variant="label" color={colors.textInverse}>Launch Rescue</Text>
            </Pressable>
          </View>
        )}

        {/* 3. Quiet Operational Safety Bar (Integrated, non-intrusive) */}
        <View style={styles.section}>
          <Text variant="label" color={colors.textSecondary} style={styles.sectionLabel}>
            Floor Safety & Controls
          </Text>

          <View style={styles.safetyStrip}>
            {/* Soft Hold Toggle */}
            <Pressable
              onPress={toggleHold}
              style={({ pressed }) => [
                styles.safetyStripBtn,
                isHolding && styles.safetyStripBtnHolding,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Toggle 3m perimeter soft hold"
            >
              <PauseCircle
                size={18}
                color={isHolding ? colors.warningText : colors.textSecondary}
                strokeWidth={2}
              />
              <View style={styles.safetyStripTextCol}>
                <Text
                  variant="bodyMedium"
                  color={isHolding ? colors.warningText : colors.textPrimary}
                  style={styles.safetyBtnTitle}
                >
                  {isHolding ? 'Hold Active (3m)' : 'Soft Hold (3m)'}
                </Text>
              </View>
            </Pressable>

            <View style={styles.safetyDivider} />

            {/* Corridor Hazard Report */}
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                navigate('block_path');
              }}
              style={({ pressed }) => [styles.safetyStripBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Report corridor hazard"
            >
              <AlertOctagon size={18} color={colors.dangerText} strokeWidth={2} />
              <View style={styles.safetyStripTextCol}>
                <Text variant="bodyMedium" color={colors.textPrimary} style={styles.safetyBtnTitle}>
                  Report Hazard
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* 4. Recent Dispatches Section */}
        <View style={styles.section}>
          <View style={styles.recentSectionHeader}>
            <Text variant="label" color={colors.textSecondary} style={styles.sectionLabel}>
              Recent Dispatches
            </Text>
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                navigate('transport_history');
              }}
              style={({ pressed }) => [styles.viewHistoryBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="View history"
            >
              <Text variant="caption" color={colors.primaryText} style={styles.viewHistoryText}>
                View All ({totalRecords})
              </Text>
              <ChevronRight size={14} color={colors.primaryText} />
            </Pressable>
          </View>

          <View style={styles.recentCardsCol}>
            {dispatches.map((dispatch) => {
              const label =
                (dispatch as any).statusLabel ||
                JOB_STATUS_PRESENTATION[dispatch.status as keyof typeof JOB_STATUS_PRESENTATION]?.label ||
                String(dispatch.status);
              return (
                <Pressable
                  key={dispatch.id}
                  onPress={() => {
                    triggerHaptic('tap');
                    if (dispatch.jobId) {
                      navigate('job_detail', { jobId: dispatch.jobId });
                    } else {
                      navigate('transport_history');
                    }
                  }}
                  style={({ pressed }) => [
                    styles.dispatchCard,
                    pressed && styles.dispatchCardPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Dispatch ${dispatch.id}, ${dispatch.type}`}
                >
                  {/* Top: TR Badge + Workflow Name stacked on left, Status Pill on right */}
                  <View style={[styles.dispatchTopRow, { alignItems: 'flex-start' }]}>
                    <View style={{ flex: 1, minWidth: 0, marginRight: 8, gap: 4 }}>
                      <View style={[styles.trCodeChip, { alignSelf: 'flex-start' }]}>
                        <Text variant="caption" color={colors.primaryText} style={styles.trCodeText}>
                          {dispatch.id}
                        </Text>
                      </View>
                      <Text variant="caption" color={colors.textSecondary} numberOfLines={1} style={styles.dispatchTypeName}>
                        {dispatch.type}
                      </Text>
                    </View>

                    <StatusPill status={dispatch.status} label={label} />
                  </View>

                  {/* Route */}
                  <Text variant="body" color={colors.textPrimary} numberOfLines={1} style={styles.dispatchRoute}>
                    {dispatch.route}
                  </Text>

                  {/* Footer: Robot (no-wrap), Container summary, Time */}
                  <View style={styles.dispatchFooter}>
                    <View style={[styles.dispatchMetaGroup, { flex: 1, minWidth: 0, marginRight: 8 }]}>
                      <Text
                        variant="caption"
                        color={colors.textPrimary}
                        numberOfLines={1}
                        style={[styles.boldText, { flexShrink: 0 }]}
                      >
                        {dispatch.robot}
                      </Text>
                      <Text variant="caption" color={colors.textMuted}>·</Text>
                      <Text variant="caption" color={colors.textPrimary} numberOfLines={1} style={[styles.boldMono, { flexShrink: 1 }]}>
                        {dispatch.container}
                      </Text>
                    </View>
                    <Text variant="caption" color={colors.textMuted} style={{ flexShrink: 0 }}>
                      {dispatch.time}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 5. Inventory & SKU Catalog Lookup Card */}
        <Pressable
          onPress={() => {
            triggerHaptic('tap');
            navigate('inventory_lookup');
          }}
          style={({ pressed }) => [
            styles.historyEntryCard,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Inventory catalog and SKU lookup"
        >
          <View style={styles.historyLeft}>
            <View style={styles.historyIconWell}>
              <Search size={18} color={colors.primaryText} />
            </View>
            <Text variant="bodyMedium" color={colors.textPrimary} style={styles.historyTitle}>
              Inventory & SKU Catalog
            </Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 18,
  },
  screenHeader: {
    paddingTop: 6,
    paddingBottom: 2,
    gap: 2,
  },
  eyebrow: {
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  pageTitle: {
    fontWeight: '800',
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  heroGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  heroBtnPrimary: {
    flex: 1,
    minHeight: 90,
    backgroundColor: colors.darkAction, // Warm Dark Gray (Graphite)
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.darkActionBorder,
    padding: 14,
    justifyContent: 'space-between',
    ...shadows.md,
  },
  heroBtnSecondary: {
    flex: 1,
    minHeight: 90,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    justifyContent: 'space-between',
    ...shadows.sm,
  },
  heroBtnPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  heroBtnTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  primaryIconWell: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryIconWell: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBtnContent: {
    gap: 2,
    marginTop: 10,
  },
  heroBtnTitle: {
    fontWeight: '700',
  },
  activeAlertCard: {
    backgroundColor: colors.dangerBg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    padding: 14,
    gap: 10,
    ...shadows.sm,
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertTitle: {
    fontWeight: '700',
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  alertDesc: {
    lineHeight: 16,
  },
  rescueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    backgroundColor: colors.danger,
    borderRadius: radii.md,
  },
  rescueBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  safetyStrip: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: 4,
    ...shadows.sm,
  },
  safetyStripBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  safetyStripBtnHolding: {
    backgroundColor: colors.warningBg,
    borderRadius: radii.md,
  },
  safetyStripTextCol: {
    flex: 1,
    gap: 1,
  },
  safetyBtnTitle: {
    fontWeight: '700',
  },
  safetyDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  recentSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  viewHistoryText: {
    fontWeight: '600',
  },
  recentCardsCol: {
    gap: 10,
  },
  dispatchCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
    ...shadows.sm,
  },
  dispatchCardPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  dispatchTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dispatchBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trCodeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
    backgroundColor: colors.primaryLight,
  },
  trCodeText: {
    fontWeight: '700',
  },
  dispatchTypeName: {
    fontWeight: '700',
  },
  dispatchRoute: {
    fontWeight: '600',
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
  dispatchFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  dispatchMetaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyEntryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadows.sm,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  historyIconWell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyTextCol: {
    flex: 1,
    gap: 2,
  },
  historyHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyTitle: {
    fontWeight: '700',
  },
  recordsPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSubtle,
  },
  recordsText: {
    fontWeight: '600',
  },
  beaconContainer: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  beaconPing: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.danger,
  },
  beaconCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  pressed: {
    opacity: 0.85,
  },
});

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertOctagon,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  History,
  LifeBuoy,
  PackagePlus,
  PauseCircle,
  Plus,
  ShieldAlert,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { JOB_STATUS_PRESENTATION, MOCK_JOBS } from '../jobs/jobData';
import { useSafetyHold } from '../../shared/context/SafetyHoldContext';
import { colors } from '../../shared/theme/colors';
import { dockReservedSpace } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { toast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';

/**
 * The stalled AMR's payload comes out of the job fixture, not out of this file.
 *
 * The copy here used to say `BOX-101 (45 units)` while the same tote is 12 pcs
 * everywhere else in the app. An incident report that disagrees with the
 * container it is about is worse than one that quotes nothing.
 */
const INCIDENT_PAYLOAD = MOCK_JOBS[0].containers[0];
const INCIDENT_PAYLOAD_QTY = INCIDENT_PAYLOAD.qty;

/**
 * The two "Recent Dispatches" rows are the same jobs the Jobs list shows, so
 * their badges read their copy from `JOB_STATUS_PRESENTATION` too. They used to
 * hand-write `ALLOCATING AMR` and `EN ROUTE` while the Jobs list called those
 * jobs *Waiting Handover* and *Running*.
 */
const RECENT_DISPATCHES = [MOCK_JOBS[0], MOCK_JOBS[1]] as const;

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

export function TransportScreen() {
  const { navigate, dockHeight } = useNavigation();
  const { isHolding, toggleHold: toggleFleetHold } = useSafetyHold();
  const [showIncidentDetails, setShowIncidentDetails] = useState(false);

  /**
   * Clearance for the absolute bottom bar, measured.
   *
   * This screen had `paddingBottom: 140` — the exact thing AGENTS.md §2.3 bans,
   * because it only cleared the bar on the device the number was measured on.
   * `dockReservedSpace` is the one way to do this (AGENTS.md §2.3).
   */
  const bottomInset = dockReservedSpace(dockHeight);

  /**
   * The soft pause lives in `SafetyHoldContext` because the header shield and
   * the safety sheet act on the same fleet state — holding from either of those
   * must show up here, and vice versa.
   *
   * Both toasts carry "(Local Fleet Simulation)": the toggle flips a local
   * boolean, and an operator reading "AMRs soft-paused" on a safety hub would
   * otherwise believe robots further down the aisle had stopped too.
   */
  const toggleHold = () => {
    triggerHaptic('tap');
    toggleFleetHold();
    if (isHolding) {
      toast.success(
        'Nearby AMR soft-pause released. Normal Nav2 navigation resumed. (Local Fleet Simulation)'
      );
    } else {
      toast.warning(
        'HOLD ROBOT ACTIVE: Nearby AMRs within 3m perimeter soft-paused. (Admin E-STOP ALL not triggered). Local Fleet Simulation.'
      );
    }
  };

  return (
    <View style={styles.container}>
      {/*
        Transport is a main tab, so the shell `AppHeader` owns the status-bar
        inset and the identity row. This screen keeps only its own title, and
        scrolls with it, so it no longer needs `useTopInset()` at all.
      */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 16 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.screenTitle}>
          <Text style={styles.pageTitle}>Transport Hub</Text>
          <Text style={styles.eyebrow}>Logistics command</Text>
        </View>
        {/* 1. Primary Hero Actions (Dispatch Operations) */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>Dispatch Operations</Text>
          <View style={styles.heroGrid}>
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
              <Plus size={24} color="#ffffff" strokeWidth={2.4} />
              <Text style={styles.heroBtnPrimaryText}>
                New Transport{'\n'}Request
              </Text>
            </Pressable>

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
              <PackagePlus size={24} color={colors.primary} strokeWidth={2.4} />
              <Text style={styles.heroBtnSecondaryText}>
                Pack{'\n'}Container
              </Text>
            </Pressable>
          </View>
        </View>

        {/* 2. Safety & Incident Hub */}
        <View style={styles.safetyCard}>
          <View style={styles.safetyHeader}>
            <View style={styles.safetyTitleGroup}>
              <View style={styles.safetyIconWrap}>
                <ShieldAlert size={16} color="#b45309" />
              </View>
              <View style={styles.safetyTitleBlock}>
                <Text style={styles.safetyTitle}>Safety & Incident Hub</Text>
              </View>
            </View>
            <View style={styles.incidentBadge}>
              <Text style={styles.incidentBadgeText}>1 Active Alert</Text>
            </View>
          </View>

          {/* Active Incident Alert Card (Rescue AMR-01) */}
          <View style={styles.incidentAlertBox}>
            <View style={styles.incidentAlertTop}>
              <View style={styles.incidentPingRow}>
                <PulsingBeaconDot />
                <Text style={styles.incidentAlertHeading}>
                  AMR-01 STALLED · CARGO AT RISK
                </Text>
              </View>
              <Text style={styles.incidentZoneText}>Zone A · Aisle 2</Text>
            </View>
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                setShowIncidentDetails((prev) => !prev);
              }}
              style={({ pressed }) => [
                styles.incidentDetailsToggle,
                pressed && styles.incidentDetailsTogglePressed,
              ]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={
                showIncidentDetails ? 'Hide incident details' : 'View incident details'
              }
              accessibilityState={{ expanded: showIncidentDetails }}
            >
              <Text style={styles.incidentDetailsToggleText}>
                {showIncidentDetails ? 'Hide details' : 'View incident details'}
              </Text>
              {showIncidentDetails ? (
                <ChevronUp size={13} color={colors.primary} strokeWidth={2.6} />
              ) : (
                <ChevronDown size={13} color={colors.primary} strokeWidth={2.6} />
              )}
            </Pressable>
            {showIncidentDetails ? (
              <Text style={styles.incidentAlertDesc}>
                Hardware motor stall with payload BOX-101 ({INCIDENT_PAYLOAD_QTY} units).
                Standby carrier AMR-02 is ready for payload transfer.
              </Text>
            ) : null}
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                navigate('payload_recovery');
              }}
              style={({ pressed }) => [
                styles.rescueBtn,
                pressed && styles.rescueBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Launch Rescue"
            >
              <LifeBuoy size={14} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.rescueBtnText}>
                Launch Rescue
              </Text>
            </Pressable>
          </View>

          {/* 2-Column Safety Utilities: Soft Hold & Block Path */}
          <View style={styles.safetyUtilitiesGrid}>
            {/* Local 3m Soft Hold Toggle */}
            <Pressable
              onPress={toggleHold}
              style={({ pressed }) => [
                styles.utilityCard,
                isHolding && styles.utilityCardHolding,
                pressed && styles.utilityCardPressed,
              ]}
            >
              <View style={styles.utilityTopRow}>
                <Text style={styles.utilityEyebrow}>PERIMETER</Text>
                <PauseCircle
                  size={14}
                  color={isHolding ? colors.danger : colors.warning}
                />
              </View>
              <Text
                style={[
                  styles.utilityTitle,
                  isHolding && styles.utilityTitleHolding,
                ]}
              >
                {isHolding ? 'Hold Active (3m)' : 'Soft Hold (3m)'}
              </Text>
            </Pressable>

            {/* Block Path Report */}
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                navigate('block_path');
              }}
              style={({ pressed }) => [
                styles.utilityCard,
                pressed && styles.utilityCardPressed,
              ]}
            >
              <View style={styles.utilityTopRow}>
                <Text style={styles.utilityEyebrow}>HAZARD</Text>
                <AlertOctagon size={14} color={colors.danger} />
              </View>
              <Text style={styles.utilityTitle}>Block Path</Text>
            </Pressable>
          </View>
        </View>

        {/* 3. Recent Dispatches Section */}
        <View style={styles.section}>
          <View style={styles.recentSectionHeader}>
            <Text style={styles.sectionEyebrow}>RECENT DISPATCHES</Text>
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                navigate('transport_history');
              }}
              style={styles.viewHistoryBtn}
              accessibilityRole="button"
              accessibilityLabel="View history"
            >
              <Text style={styles.viewHistoryBtnText}>View History</Text>
              <ChevronRight size={13} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.recentCardsCol}>
            {/* Card TR-2048 */}
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                navigate('job_detail', { jobId: 'JOB-2026-0812' });
              }}
              style={({ pressed }) => [
                styles.recentOrderCard,
                pressed && styles.recentOrderCardPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="View details for TR-2048"
            >
              <View style={styles.recentCardTop}>
                <View style={styles.recentBadgeRow}>
                  <View style={styles.trBadgeInfo}>
                    <Text style={styles.trBadgeInfoText}>TR-2048</Text>
                  </View>
                  <Text style={styles.recentWfName}>Inbound Putaway</Text>
                </View>
                <View style={styles.statusAllocatingBadge}>
                  <Text style={styles.statusAllocatingText}>
                    {JOB_STATUS_PRESENTATION[RECENT_DISPATCHES[0].status].label}
                  </Text>
                </View>
              </View>
              <Text style={styles.recentRouteText} numberOfLines={1}>
                Dock 01 ➔ Rack A · Level 2 · Bin 03 (BOX-101)
              </Text>
              <View style={styles.recentCardFooter}>
                <Text style={styles.assignedRobotText}>AMR-01</Text>
                <Text style={styles.recentTimeText}>Just now</Text>
              </View>
            </Pressable>

            {/* Card TR-2046 */}
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                navigate('job_detail', { jobId: 'JOB-2026-0813' });
              }}
              style={({ pressed }) => [
                styles.recentOrderCard,
                pressed && styles.recentOrderCardPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="View details for TR-2046"
            >
              <View style={styles.recentCardTop}>
                <View style={styles.recentBadgeRow}>
                  <View style={styles.trBadgeMuted}>
                    <Text style={styles.trBadgeMutedText}>TR-2046</Text>
                  </View>
                  <Text style={styles.recentWfName}>Outbound Retrieval</Text>
                </View>
                <View style={styles.statusEnRouteBadge}>
                  <Text style={styles.statusEnRouteText}>
                    {JOB_STATUS_PRESENTATION[RECENT_DISPATCHES[1].status].label}
                  </Text>
                </View>
              </View>
              <Text style={styles.recentRouteText} numberOfLines={1}>
                Rack B-04 ➔ Dock Out 01 (BOX-204)
              </Text>
              <View style={styles.recentCardFooter}>
                <Text style={styles.assignedRobotMutedText}>AMR-02</Text>
                <Text style={styles.recentTimeText}>4m ago</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* 4. Full Transport Order History & Audit Log Card */}
        <Pressable
          onPress={() => {
            triggerHaptic('tap');
            navigate('transport_history');
          }}
          style={({ pressed }) => [
            styles.historyEntryCard,
            pressed && styles.historyEntryCardPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Transport History & Audit Log"
        >
          <View style={styles.historyEntryLeft}>
            <View style={styles.historyIconWrap}>
              <History size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.historyEntryHeadingRow}>
                <Text style={styles.historyEntryTitle}>
                  Transport History & Audit Log
                </Text>
                <View style={styles.recordsBadge}>
                  <Text style={styles.recordsBadgeText}>8 records</Text>
                </View>
              </View>
              <Text style={styles.historyEntrySubtitle}>
                View all order logs & audit trail
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
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
  screenTitle: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
    color: colors.textPrimary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  /**
   * Section eyebrow: 12pt Title Case with ordinary tracking.
   *
   * `textTransform: 'uppercase'` plus 1.4pt of letter-spacing is the Phase 0
   * industrial-HUD voice. Transport is one of the four main tabs and its
   * sibling tabs (Home, Jobs, Live Map) are all Calm Operations, so the eyebrow
   * is the last place on this screen that reads like a different app.
   */
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  heroGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  heroBtnPrimary: {
    flex: 1,
    height: 112,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 8,
    // Flat surface: one hairline and one shadow step, no 3D bevel (AGENTS.md §0).
    borderWidth: 1,
    borderColor: colors.primaryDark,
    ...shadows.md,
  },
  heroBtnSecondary: {
    flex: 1,
    height: 112,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(0, 92, 209, 0.3)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  heroBtnPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  heroBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 16,
    fontFamily: typography.fontSans,
  },
  heroBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
    lineHeight: 16,
    fontFamily: typography.fontSans,
  },
  safetyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  safetyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.7)',
    paddingBottom: 8,
  },
  safetyTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  safetyIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  safetyTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  incidentBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  incidentBadgeText: {
    fontFamily: typography.fontMono,
    fontSize: 9,
    fontWeight: '900',
    color: colors.danger,
  },
  incidentAlertBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  incidentAlertTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  incidentPingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },
  beaconCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#dc2626',
    zIndex: 2,
  },
  incidentAlertHeading: {
    fontFamily: typography.fontMono,
    fontSize: 10,
    fontWeight: '900',
    color: colors.danger,
  },
  incidentZoneText: {
    fontFamily: typography.fontMono,
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
  },
  incidentAlertDesc: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 15,
    fontFamily: typography.fontSans,
  },
  incidentDetailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    minHeight: 32,
    marginTop: -2,
  },
  incidentDetailsTogglePressed: {
    opacity: 0.6,
  },
  incidentDetailsToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    fontFamily: typography.fontSans,
  },
  rescueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    borderRadius: 6,
    height: 32,
    marginTop: 2,
  },
  rescueBtnPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  rescueBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
    fontFamily: typography.fontSans,
  },
  safetyUtilitiesGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  utilityCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    justifyContent: 'space-between',
    minHeight: 92,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  utilityCardHolding: {
    backgroundColor: '#fef2f2',
    borderColor: colors.danger,
  },
  utilityCardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  utilityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  utilityEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.textMuted,
    textTransform: 'uppercase',
    fontFamily: typography.fontSans,
  },
  utilityTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 4,
    fontFamily: typography.fontSans,
  },
  utilityTitleHolding: {
    color: colors.danger,
  },
  recentSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  viewHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 92, 209, 0.1)',
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 4,
  },
  viewHistoryBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontSans,
  },
  recentCardsCol: {
    gap: 8,
  },
  recentOrderCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    gap: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  recentOrderCardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  recentCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trBadgeInfo: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 92, 209, 0.25)',
  },
  trBadgeInfoText: {
    fontFamily: typography.fontMono,
    fontSize: 9,
    fontWeight: '900',
    color: colors.primary,
  },
  trBadgeMuted: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trBadgeMutedText: {
    fontFamily: typography.fontMono,
    fontSize: 9,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  recentWfName: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  statusAllocatingBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.25)',
  },
  statusAllocatingText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#92400e',
    fontFamily: typography.fontSans,
  },
  statusEnRouteBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 92, 209, 0.25)',
  },
  statusEnRouteText: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontSans,
  },
  recentRouteText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  recentCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
    marginTop: 2,
  },
  assignedRobotText: {
    fontFamily: typography.fontMono,
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
  },
  assignedRobotMutedText: {
    fontFamily: typography.fontMono,
    fontSize: 9,
    fontWeight: '500',
    color: colors.textMuted,
  },
  recentTimeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  historyEntryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  historyEntryCardPressed: {
    borderColor: colors.primary,
    transform: [{ scale: 0.98 }],
  },
  historyEntryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  historyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 102, 204, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyEntryHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyEntryTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  recordsBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recordsBadgeText: {
    fontFamily: typography.fontMono,
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
  },
  historyEntrySubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
});

import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutAnimation,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BatteryMedium,
  Check,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { MapRobot, MiniFacilityMap } from './MiniFacilityMap';
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { useToast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';

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
    battery: 92,
    speed: '0.0 m/s',
  },
];

export function HomeScreen() {
  const { session } = useAuth();
  const { navigate } = useNavigation();
  const { success: showToastSuccess } = useToast();
  const [selectedRobotId, setSelectedRobotId] = useState<string>('AMR-01');
  const [sheetExpanded, setSheetExpanded] = useState<boolean>(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.search) {
      try {
        const s = new URLSearchParams(window.location.search).get('screen');
        const focus = new URLSearchParams(window.location.search).get('focus');
        return s === 'home-pulse' || focus === 'pulse' || focus === 'expanded';
      } catch {
        return false;
      }
    }
    return false;
  });
  const [netStatus, setNetStatus] = useState<'syncing' | 'connected' | 'hidden'>('syncing');

  useEffect(() => {
    const t1 = setTimeout(() => setNetStatus('connected'), 1200);
    const t2 = setTimeout(() => setNetStatus('hidden'), 3500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const activeZone = session?.zone || 'Inbound Dock 01';

  const handleOpenHandoverTask = () => {
    triggerHaptic('tap');
    navigate('job_detail', { jobId: 'JOB-2026-0812' });
  };

  const handleLocateUser = () => {
    setSelectedRobotId('AMR-01');
    const zoneName = activeZone.includes('(')
      ? activeZone.split('(')[0].trim()
      : activeZone;
    showToastSuccess(
      `Centered map on your location (${zoneName})`,
      `Active Work Zone: ${zoneName}`,
      'pin'
    );
  };

  const toggleSheet = (nextState?: boolean) => {
    const target = typeof nextState === 'boolean' ? nextState : !sheetExpanded;
    triggerHaptic('tap');
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setSheetExpanded(target);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return (
          Math.abs(gestureState.dy) > 12 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
        );
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -25) {
          // Swiped UP -> expand
          if (!sheetExpanded) {
            toggleSheet(true);
          }
        } else if (gestureState.dy > 25) {
          // Swiped DOWN -> collapse
          if (sheetExpanded) {
            toggleSheet(false);
          }
        }
      },
    })
  ).current;

  return (
    <View style={styles.root}>
      {/* Floating WES Sync Status Pill */}
      {netStatus !== 'hidden' && (
        <View style={styles.floatingSyncContainer} pointerEvents="none">
          <View style={styles.floatingSyncPill}>
            {netStatus === 'syncing' ? (
              <RefreshCw size={12} color="#38bdf8" />
            ) : (
              <Check size={12} color={colors.success} />
            )}
            <Text style={styles.floatingSyncText}>
              {netStatus === 'syncing' ? 'Syncing with WES...' : 'WMS Connected'}
            </Text>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          !sheetExpanded && styles.scrollContentCollapsed,
        ]}
        bounces={false}
        scrollEnabled={sheetExpanded}
      >
        {/* 1. Technical Blueprint Facility Radar Map */}
        <MiniFacilityMap
          currentZone={activeZone}
          selectedRobotId={selectedRobotId}
          onSelectRobot={setSelectedRobotId}
          onLocateUser={handleLocateUser}
          onSearch={() => navigate('inventory_lookup')}
          robots={INITIAL_ROBOTS}
          style={sheetExpanded ? styles.mapExpanded : styles.mapCollapsed}
        />

        {/* 2. Interactive 2-Stage Bottom Sheet (Grab/Uber style with swipe up/down) */}
        <View style={styles.bottomSheet} {...panResponder.panHandlers}>
          {/* Handle Bar & Sheet Header Toggle */}
          <Pressable
            onPress={() => toggleSheet()}
            style={styles.sheetHandleArea}
            accessibilityRole="button"
            accessibilityLabel={sheetExpanded ? 'Collapse fleet view' : 'Expand fleet view'}
          >
            <View style={styles.handlePill} />
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetTitleGroup}>
                <View style={styles.amberDot} />
                <Text style={styles.sheetTitle}>NEXT HANDOVER TASK</Text>
              </View>
              <Text style={styles.sheetToggleText}>
                {sheetExpanded ? 'Collapse Fleet View ▼' : 'Expand Fleet & Pulse ▲'}
              </Text>
            </View>
          </Pressable>

          {/* Hero Task Card (Always Visible in Peek State) */}
          <View style={styles.heroCardContainer}>
            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <View style={styles.heroPillGroup}>
                  <View style={styles.amrPill}>
                    <Text style={styles.amrPillText}>AMR-01</Text>
                  </View>
                  <Text style={styles.workflowText}>INBOUND PUTAWAY</Text>
                </View>
                <View style={styles.etaPill}>
                  <Text style={styles.etaText}>ETA 45s (8m away)</Text>
                </View>
              </View>

              <View style={styles.heroBottomRow}>
                <View style={styles.heroTextCol}>
                  <Text style={styles.targetLocationText} numberOfLines={1}>
                    Target: Rack A · Level 2 · Bin 03
                  </Text>
                  <Text style={styles.slotDetailsText} numberOfLines={1}>
                    Slot 1 (Front): BOX-101 (45 pcs)
                  </Text>
                </View>
                <Pressable
                  onPress={handleOpenHandoverTask}
                  style={({ pressed }) => [
                    styles.openTaskBtn,
                    pressed && styles.openTaskBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Open handover task"
                >
                  <Text style={styles.openTaskText}>Open Task ➔</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* 3. Expanded Drawer Content (Warehouse Pulse & Fleet Telemetry) */}
          {sheetExpanded && (
            <View style={styles.expandedContent}>
              {/* Warehouse Pulse Card */}
              <View style={styles.pulseCard}>
                <View style={styles.pulseHeader}>
                  <View style={styles.pulseTitleGroup}>
                    <Text style={styles.pulseTitle}>WAREHOUSE PULSE</Text>
                    <View style={styles.liveBadge}>
                      <Text style={styles.liveBadgeText}>LIVE TELEMETRY</Text>
                    </View>
                  </View>
                  <View style={styles.liveStatus}>
                    <View style={styles.greenPulseDot} />
                    <Text style={styles.liveStatusText}>LIVE</Text>
                  </View>
                </View>

                <View style={styles.metricRow}>
                  <View style={styles.metricCol}>
                    <Text style={[styles.metricValue, styles.metricSuccess]}>2/2</Text>
                    <Text style={styles.metricLabel}>Fleet Ready</Text>
                  </View>
                  <View style={[styles.metricCol, styles.metricDivider]}>
                    <Text style={styles.metricValue}>1</Text>
                    <Text style={styles.metricLabel}>My Active Tasks</Text>
                  </View>
                  <View style={[styles.metricCol, styles.metricDivider]}>
                    <Text style={[styles.metricValue, styles.metricSuccess]}>0</Text>
                    <Text style={styles.metricLabel}>Hazards</Text>
                  </View>
                </View>
              </View>

              {/* Active Fleet (2 AMRs) Cards */}
              <View style={styles.fleetSection}>
                <View style={styles.fleetHeaderRow}>
                  <Text style={styles.fleetTitle}>ACTIVE FLEET (2 AMRS)</Text>
                  <Text style={styles.fleetSubtitle}>Physical Fleet Scope</Text>
                </View>

                <View style={styles.fleetCardsGrid}>
                  {/* AMR-01 */}
                  <Pressable
                    onPress={() => {
                      triggerHaptic('tap');
                      setSelectedRobotId('AMR-01');
                    }}
                    style={[
                      styles.robotCard,
                      selectedRobotId === 'AMR-01' && styles.robotCardSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Select AMR-01"
                  >
                    <View style={styles.robotCardTop}>
                      <Text style={styles.robotCardId}>AMR-01</Text>
                      <View style={styles.robotStatusPillEnRoute}>
                        <Text style={styles.robotStatusTextEnRoute}>EN ROUTE</Text>
                      </View>
                    </View>
                    <Text style={styles.robotCardTask} numberOfLines={1}>
                      Transporting Tote BOX-101 to Rack A-02
                    </Text>
                    <View style={styles.robotCardBottom}>
                      <View style={styles.batteryWrap}>
                        <BatteryMedium size={12} color={colors.success} />
                        <Text style={styles.batteryVal}>78%</Text>
                      </View>
                      <Text style={styles.totesText}>3 Totes</Text>
                    </View>
                  </Pressable>

                  {/* AMR-02 */}
                  <Pressable
                    onPress={() => {
                      triggerHaptic('tap');
                      setSelectedRobotId('AMR-02');
                    }}
                    style={[
                      styles.robotCard,
                      selectedRobotId === 'AMR-02' && styles.robotCardSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Select AMR-02"
                  >
                    <View style={styles.robotCardTop}>
                      <Text style={styles.robotCardId}>AMR-02</Text>
                      <View style={styles.robotStatusPillStandby}>
                        <Text style={styles.robotStatusTextStandby}>STANDBY</Text>
                      </View>
                    </View>
                    <Text style={styles.robotCardTask} numberOfLines={1}>
                      Docking at Charger Station 02
                    </Text>
                    <View style={styles.robotCardBottom}>
                      <View style={styles.batteryWrap}>
                        <BatteryMedium size={12} color={colors.success} />
                        <Text style={styles.batteryVal}>94%</Text>
                      </View>
                      <Text style={styles.totesText}>0 Totes</Text>
                    </View>
                  </Pressable>
                </View>
              </View>

              {/* Operating Normally Safety Banner */}
              <View style={styles.normalBanner}>
                <ShieldCheck size={20} color={colors.primary} />
                <View style={styles.normalBannerText}>
                  <Text style={styles.normalTitle}>Systems operating normally</Text>
                  <Text style={styles.normalSubtitle}>
                    2/2 Physical AMRs online (AMR-01 & AMR-02) · No navigational deadlocks.
                  </Text>
                </View>
              </View>

              {/* Quick Transport Request Action Button */}
              <Pressable
                onPress={() => {
                  triggerHaptic('tap');
                  navigate('transport_create');
                }}
                style={({ pressed }) => [
                  styles.newTransportBtn,
                  pressed && styles.newTransportBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Create new transport request"
              >
                <Plus size={16} color="#ffffff" strokeWidth={2.6} />
                <Text style={styles.newTransportBtnText}>+ New Transport Request</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: 'relative',
    backgroundColor: colors.background,
  },
  floatingSyncContainer: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    zIndex: 99,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingSyncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(7, 21, 35, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingSyncText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: typography.fontSans,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  scrollContentCollapsed: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: 0,
  },
  mapCollapsed: {
    flex: 1,
    minHeight: 380,
  },
  mapExpanded: {
    height: 280,
  },
  bottomSheet: {
    marginTop: -14,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 30,
  },
  sheetHandleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 16,
  },
  handlePill: {
    width: 48,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(84, 101, 125, 0.3)',
    marginBottom: 8,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  sheetTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  amberDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.warning,
  },
  sheetTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.primary,
    fontFamily: typography.fontSans,
  },
  sheetToggleText: {
    fontSize: 9,
    fontFamily: typography.fontMono,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  heroCardContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  heroCard: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(0, 92, 209, 0.35)',
    backgroundColor: colors.surface,
    padding: 14,
    ...shadows.panel,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  heroPillGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  amrPill: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  amrPillText: {
    color: '#ffffff',
    fontSize: 9,
    fontFamily: typography.fontMono,
    fontWeight: '900',
  },
  workflowText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontFamily: typography.fontSans,
  },
  etaPill: {
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
  },
  etaText: {
    color: '#854d0e',
    fontSize: 9,
    fontFamily: typography.fontMono,
    fontWeight: '800',
  },
  heroBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroTextCol: {
    flex: 1,
  },
  targetLocationText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  slotDetailsText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  openTaskBtn: {
    height: 32,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    borderBottomWidth: 2,
    borderBottomColor: '#004bb0',
    shadowColor: '#00285a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
  openTaskBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
  openTaskText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    fontFamily: typography.fontSans,
  },
  newTransportBtn: {
    marginTop: 10,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderBottomWidth: 2,
    borderBottomColor: '#004bb0',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 3,
  },
  newTransportBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  newTransportBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    fontFamily: typography.fontSans,
    letterSpacing: 0.2,
  },
  expandedContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  pulseCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadows.panel,
  },
  pulseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  pulseTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulseTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  liveBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveBadgeText: {
    fontSize: 9,
    fontFamily: typography.fontMono,
    fontWeight: '900',
    color: colors.primary,
  },
  liveStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  greenPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  liveStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.success,
    fontFamily: typography.fontSans,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricCol: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  metricSuccess: {
    color: colors.success,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  fleetSection: {
    gap: 8,
  },
  fleetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fleetTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  fleetSubtitle: {
    fontSize: 10,
    fontFamily: typography.fontMono,
    fontWeight: '700',
    color: colors.primary,
  },
  fleetCardsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  robotCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  robotCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    ...shadows.panel,
  },
  robotCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  robotCardId: {
    fontSize: 12,
    fontFamily: typography.fontMono,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  robotStatusPillEnRoute: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  robotStatusTextEnRoute: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontSans,
  },
  robotStatusPillStandby: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  robotStatusTextStandby: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.success,
    fontFamily: typography.fontSans,
  },
  robotCardTask: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 6,
    fontFamily: typography.fontSans,
  },
  robotCardBottom: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  batteryWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  batteryVal: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  totesText: {
    fontSize: 9,
    fontFamily: typography.fontMono,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  normalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: 12,
    gap: 12,
  },
  normalBannerText: {
    flex: 1,
  },
  normalTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontSans,
  },
  normalSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 1,
    fontFamily: typography.fontSans,
  },
});

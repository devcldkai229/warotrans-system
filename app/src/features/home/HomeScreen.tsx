import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BatteryMedium,
  ShieldCheck,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { MapRobot, MiniFacilityMap } from './MiniFacilityMap';
import { colors } from '../../shared/theme/colors';

const INITIAL_ROBOTS: MapRobot[] = [
  {
    id: 'AMR-01',
    xPercent: 32,
    yPercent: 44,
    headingDeg: 120,
    status: 'EN_ROUTE',
    battery: 78,
    speed: '1.2 m/s',
  },
  {
    id: 'AMR-02',
    xPercent: 78,
    yPercent: 72,
    headingDeg: 0,
    status: 'STANDBY',
    battery: 94,
    speed: '0.0 m/s',
  },
];

export function HomeScreen() {
  const { session } = useAuth();
  const { navigate } = useNavigation();
  const [selectedRobotId, setSelectedRobotId] = useState<string>('AMR-01');
  const [sheetExpanded, setSheetExpanded] = useState<boolean>(false);

  const activeZone = session?.zone || 'Inbound Dock 01';

  const handleOpenHandoverTask = () => {
    navigate('job_detail', { jobId: 'JOB-2026-0881' });
  };

  const handleLocateUser = () => {
    setSelectedRobotId('AMR-01');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} bounces={false}>
      {/* 1. Technical Blueprint Facility Radar Map */}
      <MiniFacilityMap
        currentZone={activeZone}
        selectedRobotId={selectedRobotId}
        onSelectRobot={setSelectedRobotId}
        onLocateUser={handleLocateUser}
        onSearch={() => navigate('inventory_lookup')}
        robots={INITIAL_ROBOTS}
      />

      {/* 2. Interactive 2-Stage Bottom Sheet (Grab/Uber style) */}
      <View style={styles.bottomSheet}>
        {/* Handle Bar & Sheet Header Toggle */}
        <Pressable
          onPress={() => setSheetExpanded(!sheetExpanded)}
          style={styles.sheetHandleArea}
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

        {/* Hero Task Card (Always Visible) */}
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
                  onPress={() => setSelectedRobotId('AMR-01')}
                  style={[
                    styles.robotCard,
                    selectedRobotId === 'AMR-01' && styles.robotCardSelected,
                  ]}
                >
                  <View style={styles.robotCardTop}>
                    <Text style={styles.robotCardId}>AMR-01</Text>
                    <View style={styles.robotStatusPillEnRoute}>
                      <Text style={styles.robotStatusTextEnRoute}>EN ROUTE</Text>
                    </View>
                  </View>
                  <Text style={styles.robotCardTask} numberOfLines={1}>
                    Inbound Putaway · Slot 1 Active
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
                  onPress={() => setSelectedRobotId('AMR-02')}
                  style={[
                    styles.robotCard,
                    selectedRobotId === 'AMR-02' && styles.robotCardSelected,
                  ]}
                >
                  <View style={styles.robotCardTop}>
                    <Text style={styles.robotCardId}>AMR-02</Text>
                    <View style={styles.robotStatusPillStandby}>
                      <Text style={styles.robotStatusTextStandby}>STANDBY</Text>
                    </View>
                  </View>
                  <Text style={styles.robotCardTask} numberOfLines={1}>
                    Depot Charging Bay 02
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

            {/* Operating Normally Info Banner */}
            <View style={styles.normalBanner}>
              <ShieldCheck size={20} color={colors.primary} />
              <View style={styles.normalBannerText}>
                <Text style={styles.normalTitle}>Systems operating normally</Text>
                <Text style={styles.normalSubtitle}>
                  2/2 Physical AMRs online · No navigational deadlocks.
                </Text>
              </View>
            </View>

            {/* Quick Action Button */}
            <Pressable
              onPress={() => navigate('transport_create')}
              style={({ pressed }) => [
                styles.newTransportBtn,
                pressed && styles.newTransportBtnPressed,
              ]}
            >
              <Text style={styles.newTransportBtnText}>+ New Transport Request</Text>
            </Pressable>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  bottomSheet: {
    marginTop: -16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    shadowColor: '#000',
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
    backgroundColor: '#cbd5e1',
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
    backgroundColor: '#f59e0b',
  },
  sheetTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    color: colors.primary,
  },
  sheetToggleText: {
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#64748b',
  },
  heroCardContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  heroCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.4)',
    backgroundColor: '#f8fafc',
    padding: 14,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
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
    paddingVertical: 3,
    borderRadius: 6,
  },
  amrPillText: {
    color: '#ffffff',
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '900',
  },
  workflowText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 0.5,
  },
  etaPill: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  etaText: {
    color: '#b45309',
    fontSize: 9,
    fontFamily: 'monospace',
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
    color: '#0f172a',
  },
  slotDetailsText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 2,
  },
  openTaskBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  openTaskBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  openTaskText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  expandedContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  pulseCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
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
    letterSpacing: 0.8,
    color: '#0f172a',
  },
  liveBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveBadgeText: {
    fontSize: 8,
    fontFamily: 'monospace',
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
    fontSize: 9,
    fontWeight: '800',
    color: colors.success,
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
    borderLeftColor: '#e2e8f0',
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
  },
  metricSuccess: {
    color: colors.success,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 2,
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
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: '#64748b',
  },
  fleetSubtitle: {
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '800',
    color: colors.primary,
  },
  fleetCardsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  robotCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
  },
  robotCardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#eff6ff',
  },
  robotCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  robotCardId: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '900',
    color: '#0f172a',
  },
  robotStatusPillEnRoute: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  robotStatusTextEnRoute: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.primary,
  },
  robotStatusPillStandby: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  robotStatusTextStandby: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.success,
  },
  robotCardTask: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 6,
  },
  robotCardBottom: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
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
    fontSize: 9,
    fontWeight: '700',
    color: '#64748b',
  },
  totesText: {
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#64748b',
  },
  normalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 12,
    gap: 10,
  },
  normalBannerText: {
    flex: 1,
  },
  normalTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.primary,
  },
  normalSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    color: '#3b82f6',
    marginTop: 1,
  },
  newTransportBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  newTransportBtnPressed: {
    opacity: 0.85,
  },
  newTransportBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
});

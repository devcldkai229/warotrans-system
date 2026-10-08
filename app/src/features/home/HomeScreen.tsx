import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { FleetRobotCard, FleetRobotInfo } from './FleetRobotCard';
import { HeroHandoverCard } from './HeroHandoverCard';
import { MapRobot, MiniFacilityMap } from './MiniFacilityMap';
import { WarehousePulseCard } from './WarehousePulseCard';
import { colors } from '../../shared/theme/colors';

const INITIAL_ROBOTS: MapRobot[] = [
  {
    id: 'AMR-01',
    xPercent: 32,
    yPercent: 44,
    headingDeg: 120,
    status: 'EN_ROUTE',
    battery: 78,
    speed: '0.8 m/s',
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

const FLEET_INFOS: FleetRobotInfo[] = [
  {
    id: 'AMR-01',
    code: 'AMR-01',
    status: 'EN_ROUTE',
    task: 'Inbound Putaway · Slot 1 Active',
    battery: 78,
    payloadText: '3 Totes Onboard',
  },
  {
    id: 'AMR-02',
    code: 'AMR-02',
    status: 'STANDBY',
    task: 'Depot Charging Bay 02 · Standby',
    battery: 94,
    payloadText: '0 Totes (Empty)',
  },
];

export function HomeScreen() {
  const { session } = useAuth();
  const { navigate, switchTab } = useNavigation();
  const [selectedRobotId, setSelectedRobotId] = useState<string>('AMR-01');

  const activeZone = session?.zone || 'Storage Zone A (Racks A01-A12)';

  const handleOpenHandoverTask = () => {
    navigate('job_detail', { jobId: 'JOB-2026-0881' });
  };

  const handleLocateUser = () => {
    // Re-focus current zone
    setSelectedRobotId('AMR-01');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* 1. Live Facility Radar & Telemetry Map */}
      <MiniFacilityMap
        currentZone={activeZone}
        selectedRobotId={selectedRobotId}
        onSelectRobot={setSelectedRobotId}
        onLocateUser={handleLocateUser}
        robots={INITIAL_ROBOTS}
      />

      <View style={styles.bodySection}>
        {/* 2. Hero Handover Task Card (Next Arriving AMR) */}
        <View style={styles.sectionWrap}>
          <HeroHandoverCard
            robotCode="AMR-01"
            workflowName="Inbound Putaway"
            etaText="ETA 45s (8m away)"
            targetLocation="Rack A · Level 2 · Bin 03"
            slotSummary="Slot 1 (Front): BOX-101 (45 pcs)"
            onOpenTask={handleOpenHandoverTask}
          />
        </View>

        {/* 3. Facility Pulse Telemetry Card */}
        <WarehousePulseCard fleetReady="2/2" activeTasks={1} hazardsCount={0} />

        {/* 4. Active Fleet Section */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>PHYSICAL FLEET SCOPE</Text>
            <Text style={styles.sectionSubtitle}>2 Active AMRs</Text>
          </View>
          <View style={styles.fleetGrid}>
            {FLEET_INFOS.map((robot) => (
              <FleetRobotCard
                key={robot.id}
                robot={robot}
                isSelected={selectedRobotId === robot.id}
                onSelect={setSelectedRobotId}
              />
            ))}
          </View>
        </View>

        {/* 5. Quick Dispatch Actions Bar */}
        <View style={styles.quickActions}>
          <Pressable
            onPress={() => navigate('transport_create')}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.primaryAction,
              pressed && styles.actionBtnPressed,
            ]}
          >
            <Text style={styles.actionIcon}>➕</Text>
            <Text style={styles.primaryActionText}>New Transport Request</Text>
          </Pressable>

          <View style={styles.actionRow}>
            <Pressable
              onPress={() => switchTab('jobs')}
              style={({ pressed }) => [
                styles.actionBtnSecondary,
                pressed && styles.actionBtnPressed,
              ]}
            >
              <Text style={styles.secondaryActionText}>📋 All Jobs Queue</Text>
            </Pressable>

            <Pressable
              onPress={() => navigate('job_monitoring', { jobId: 'JOB-2026-0881' })}
              style={({ pressed }) => [
                styles.actionBtnSecondary,
                pressed && styles.actionBtnPressed,
              ]}
            >
              <Text style={styles.secondaryActionText}>📡 AMR Live Monitor</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  bodySection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionWrap: {
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textSecondary,
  },
  sectionSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  fleetGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  quickActions: {
    marginTop: 8,
    gap: 8,
  },
  actionBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primaryAction: {
    backgroundColor: colors.primary,
  },
  primaryActionText: {
    color: colors.textInverse,
    fontSize: 13,
    fontWeight: '800',
  },
  actionIcon: {
    fontSize: 14,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtnSecondary: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  actionBtnPressed: {
    opacity: 0.8,
  },
});

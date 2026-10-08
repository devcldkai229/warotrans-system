import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ArrowUpRight,
  BatteryCharging,
  CheckCircle2,
  MapPin,
  Truck,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../features/auth/authContext';
import { LoginScreen } from '../../features/auth/LoginScreen';
import { HomeScreen } from '../../features/home/HomeScreen';
import { CreateContainerScreen } from '../../features/inventory/CreateContainerScreen';
import { InventoryLookupScreen } from '../../features/inventory/InventoryLookupScreen';
import { JobDetailScreen } from '../../features/jobs/JobDetailScreen';
import { JobsScreen } from '../../features/jobs/JobsScreen';
import { BarcodeScannerHUD } from '../../features/monitoring/BarcodeScannerHUD';
import { JobLiveMapScreen } from '../../features/monitoring/JobLiveMapScreen';
import { JobMonitoringScreen } from '../../features/monitoring/JobMonitoringScreen';
import { OfflineBannerHUD } from '../../features/monitoring/OfflineBannerHUD';
import { BlockPathHazardScreen } from '../../features/safety/BlockPathHazardScreen';
import { FleetRecallScreen } from '../../features/safety/FleetRecallScreen';
import { PayloadRecoveryScreen } from '../../features/safety/PayloadRecoveryScreen';
import { PointToPointScreen } from '../../features/transport/PointToPointScreen';
import { ReplenishmentScreen } from '../../features/transport/ReplenishmentScreen';
import { TransportCreationScreen } from '../../features/transport/TransportCreationScreen';
import { TransportHistoryScreen } from '../../features/transport/TransportHistoryScreen';
import { TransportScreen } from '../../features/transport/TransportScreen';
import { AppHeader } from '../../shared/components/AppHeader';
import { colors } from '../../shared/theme/colors';
import { typography } from '../../shared/theme/typography';
import { shadows } from '../../shared/theme/shadows';
import { triggerHaptic } from '../../shared/utils/haptics';
import { BottomTabBar } from './BottomTabBar';
import { useNavigation } from './NavigationContext';

interface WorkZoneOption {
  id: string;
  name: string;
  tag: string;
  status: string;
  icon: React.ComponentType<any>;
}

const WORK_ZONES: WorkZoneOption[] = [
  {
    id: 'zone-a',
    name: 'Storage Zone A (Racks A01-A12)',
    tag: 'CURRENT ASSIGNED',
    status: 'Active · 1 AMR En Route',
    icon: MapPin,
  },
  {
    id: 'zone-b',
    name: 'Storage Zone B (Racks B01-B12)',
    tag: 'READY',
    status: 'Standby · 0 Pending Tasks',
    icon: MapPin,
  },
  {
    id: 'inbound-dock',
    name: 'Inbound Receiving Docks (Dock 01 - 03)',
    tag: 'HIGH LOAD',
    status: '2 Containers Waiting Unload',
    icon: Truck,
  },
  {
    id: 'outbound-dock',
    name: 'Outbound Staging Docks (Dock 04 - 06)',
    tag: 'CLEAR',
    status: 'Ready for Dispatch Delivery',
    icon: ArrowUpRight,
  },
  {
    id: 'depot-charger',
    name: 'Robot Charging & Maintenance Depot',
    tag: 'MAINTENANCE',
    status: '2 Chargers Available · AMR-02 Ready',
    icon: BatteryCharging,
  },
];

export function AppNavigator() {
  const { session, isAuthenticated, logout, updateZone } = useAuth();
  const { currentScreen, goBack } = useNavigation();
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);

  if (!isAuthenticated || !session) {
    return <LoginScreen />;
  }

  const isMainTab =
    currentScreen === 'home' || currentScreen === 'jobs' || currentScreen === 'transport';

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return <HomeScreen />;
      case 'jobs':
        return <JobsScreen />;
      case 'transport':
        return <TransportScreen />;
      case 'job_detail':
        return <JobDetailScreen />;
      case 'job_monitoring':
        return <JobMonitoringScreen />;
      case 'transport_create':
        return <TransportCreationScreen />;
      case 'create_container':
        return <CreateContainerScreen />;
      case 'inventory_lookup':
        return <InventoryLookupScreen />;
      case 'live_map':
        return <JobLiveMapScreen />;
      case 'payload_recovery':
        return <PayloadRecoveryScreen />;
      case 'fleet_recall':
        return <FleetRecallScreen />;
      case 'replenishment':
        return <ReplenishmentScreen />;
      case 'point_to_point':
        return <PointToPointScreen />;
      case 'block_path':
        return <BlockPathHazardScreen />;
      case 'transport_history':
        return <TransportHistoryScreen />;
      case 'offline_hud':
        return <OfflineBannerHUD />;
      case 'scanner_hud':
        return (
          <BarcodeScannerHUD
            visible={true}
            onClose={goBack}
            onScanResult={() => goBack()}
          />
        );
      default:
        return <HomeScreen />;
    }
  };

  return (
    <View style={styles.root}>
      {isMainTab && (
        <AppHeader
          operatorName={session.fullName}
          zone={session.zone}
          onLogout={logout}
          onZonePress={() => setIsZoneModalOpen(true)}
        />
      )}

      <View style={styles.content}>{renderScreen()}</View>

      {isMainTab && <BottomTabBar />}

      {/* SCR-STF-02 Work Zone Switcher Modal */}
      <Modal
        visible={isZoneModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsZoneModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Top Drag Handle Indicator */}
            <View style={styles.dragHandle} />

            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.modalEyebrow}>SCR-STF-02 · WORK ZONE SELECTION</Text>
                <Text style={styles.modalTitle}>Select Operating Work Zone</Text>
                <Text style={styles.modalSubtitle}>
                  Designate active warehouse perimeter for cargo handover and robot dispatch.
                </Text>
              </View>
              <Pressable
                onPress={() => setIsZoneModalOpen(false)}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Close modal"
              >
                <X size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {WORK_ZONES.map((zone) => {
                const isSelected =
                  session.zone === zone.name ||
                  (zone.id === 'zone-a' && session.zone.includes('Zone A')) ||
                  (zone.id === 'zone-b' && session.zone.includes('Zone B')) ||
                  (zone.id === 'inbound-dock' && session.zone.includes('Inbound')) ||
                  (zone.id === 'outbound-dock' &&
                    (session.zone.includes('Outbound') || session.zone.includes('Dock 04')));
                const IconComponent = zone.icon;

                return (
                  <Pressable
                    key={zone.id}
                    onPress={() => {
                      triggerHaptic('tap');
                      updateZone(zone.name);
                      // As explicitly requested by user: no popup toast when switching zone
                    }}
                    style={[
                      styles.zoneCard,
                      isSelected && styles.zoneCardSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={zone.name}
                  >
                    <View style={styles.zoneCardLeft}>
                      <View
                        style={[
                          styles.zoneIconWrap,
                          isSelected ? styles.zoneIconWrapSelected : styles.zoneIconWrapDefault,
                        ]}
                      >
                        <IconComponent
                          size={18}
                          color={isSelected ? '#ffffff' : colors.textSecondary}
                        />
                      </View>
                      <View style={styles.zoneInfoCol}>
                        <Text
                          style={[
                            styles.zoneCardName,
                            isSelected && styles.zoneCardNameSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {zone.name}
                        </Text>
                        <Text style={styles.zoneCardStatus} numberOfLines={1}>
                          {zone.status}
                        </Text>
                      </View>
                    </View>

                    {/* Status Pill Tag */}
                    <View
                      style={[
                        styles.zoneTagPill,
                        isSelected
                          ? styles.zoneTagSelected
                          : zone.tag === 'READY' || zone.tag === 'CLEAR'
                          ? styles.zoneTagSuccess
                          : zone.tag === 'HIGH LOAD'
                          ? styles.zoneTagWarning
                          : styles.zoneTagMuted,
                      ]}
                    >
                      <Text
                        style={[
                          styles.zoneTagText,
                          isSelected
                            ? styles.zoneTagTextSelected
                            : zone.tag === 'READY' || zone.tag === 'CLEAR'
                            ? styles.zoneTagTextSuccess
                            : zone.tag === 'HIGH LOAD'
                            ? styles.zoneTagTextWarning
                            : styles.zoneTagTextMuted,
                        ]}
                      >
                        {isSelected ? 'CURRENT SELECTION' : zone.tag}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Bottom Confirmation Button */}
            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => {
                  triggerHaptic('tap');
                  setIsZoneModalOpen(false);
                }}
                style={({ pressed }) => [
                  styles.confirmZoneBtn,
                  pressed && styles.confirmZoneBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Confirm assigned work zone"
              >
                <CheckCircle2 size={16} color="#ffffff" />
                <Text style={styles.confirmZoneBtnText}>CONFIRM ASSIGNED WORK ZONE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    paddingTop: 10,
    paddingBottom: 24,
    maxHeight: '85%',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    ...shadows.sheet,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: typography.fontMono,
    letterSpacing: 1.2,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
    marginTop: 2,
  },
  modalSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
    marginTop: 3,
    lineHeight: 15,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceSubtle,
  },
  modalScroll: {
    marginBottom: 14,
  },
  zoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: 10,
    backgroundColor: colors.surface,
    ...shadows.panel,
  },
  zoneCardSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(0, 92, 209, 0.05)',
  },
  zoneCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  zoneIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneIconWrapSelected: {
    backgroundColor: colors.primary,
  },
  zoneIconWrapDefault: {
    backgroundColor: colors.surfaceSubtle,
  },
  zoneInfoCol: {
    flex: 1,
  },
  zoneCardName: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  zoneCardNameSelected: {
    color: colors.primary,
  },
  zoneCardStatus: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
    marginTop: 2,
  },
  zoneTagPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  zoneTagSelected: {
    backgroundColor: colors.primary,
  },
  zoneTagSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  zoneTagWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  zoneTagMuted: {
    backgroundColor: colors.surfaceSubtle,
  },
  zoneTagText: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: typography.fontMono,
    textTransform: 'uppercase',
  },
  zoneTagTextSelected: {
    color: '#ffffff',
  },
  zoneTagTextSuccess: {
    color: colors.success,
  },
  zoneTagTextWarning: {
    color: '#b45309',
  },
  zoneTagTextMuted: {
    color: colors.textSecondary,
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  confirmZoneBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#004bb0',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmZoneBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  confirmZoneBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    fontFamily: typography.fontSans,
    letterSpacing: 0.4,
  },
});

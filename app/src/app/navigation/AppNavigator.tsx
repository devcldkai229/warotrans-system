import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../../features/auth/authContext';
import { LoginScreen } from '../../features/auth/LoginScreen';
import { HomeScreen } from '../../features/home/HomeScreen';
import { JobDetailScreen } from '../../features/jobs/JobDetailScreen';
import { JobsScreen } from '../../features/jobs/JobsScreen';
import { JobMonitoringScreen } from '../../features/monitoring/JobMonitoringScreen';
import { TransportCreationScreen } from '../../features/transport/TransportCreationScreen';
import { TransportScreen } from '../../features/transport/TransportScreen';
import { AppHeader } from '../../shared/components/AppHeader';
import { colors } from '../../shared/theme/colors';
import { BottomTabBar } from './BottomTabBar';
import { useNavigation } from './NavigationContext';

const AVAILABLE_ZONES = [
  'Storage Zone A (Racks A01-A12)',
  'Inbound Dock 01 (Receiving Bay)',
  'Storage Zone B (Racks B01-B12)',
  'Outbound Dock 04 (Staging & Dispatch)',
  'Depot Charging & Maintenance',
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
      default:
        return <HomeScreen />;
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader
        operatorName={session.fullName}
        zone={session.zone}
        onLogout={logout}
        onZonePress={() => setIsZoneModalOpen(true)}
      />

      {!isMainTab && (
        <View style={styles.subHeaderBar}>
          <Pressable
            onPress={goBack}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
          >
            <Text style={styles.backChevron}>‹</Text>
            <Text style={styles.backLabel}>Back</Text>
          </Pressable>
          <Text style={styles.subHeaderTitle}>
            {currentScreen === 'job_detail'
              ? 'Job Stepper & Payload'
              : currentScreen === 'job_monitoring'
              ? 'Live AMR Execution'
              : 'New Transport Request'}
          </Text>
        </View>
      )}

      <View style={styles.content}>{renderScreen()}</View>

      {isMainTab && <BottomTabBar />}

      {/* Zone Switcher Modal */}
      <Modal
        visible={isZoneModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsZoneModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Switch Facility Work Zone</Text>
                <Text style={styles.modalSubtitle}>
                  Update your active dispatch & AMR monitor assignment
                </Text>
              </View>
              <Pressable
                onPress={() => setIsZoneModalOpen(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalScroll}>
              {AVAILABLE_ZONES.map((zone) => {
                const isSelected = session.zone === zone;
                return (
                  <Pressable
                    key={zone}
                    onPress={() => {
                      updateZone(zone);
                      setIsZoneModalOpen(false);
                    }}
                    style={[
                      styles.zoneItem,
                      isSelected && styles.zoneItemSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.zoneItemText,
                        isSelected && styles.zoneItemTextSelected,
                      ]}
                    >
                      {zone}
                    </Text>
                    {isSelected && (
                      <View style={styles.selectedBadge}>
                        <Text style={styles.selectedBadgeText}>CURRENT</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
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
  subHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surfaceSubtle,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  backButtonPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  backChevron: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    lineHeight: 18,
  },
  backLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  subHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
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
    padding: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: '700',
  },
  modalScroll: {
    marginBottom: 16,
  },
  zoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  zoneItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  zoneItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  zoneItemTextSelected: {
    fontWeight: '700',
    color: colors.primaryDark,
  },
  selectedBadge: {
    backgroundColor: colors.primary,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  selectedBadgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: '800',
  },
});

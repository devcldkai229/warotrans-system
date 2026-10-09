import React from 'react';
import { StyleSheet, View } from 'react-native';
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
import { BottomTabBar } from './BottomTabBar';
import { useNavigation } from './NavigationContext';

export function AppNavigator() {
  const { session, isAuthenticated, logout, updateZone } = useAuth();
  const { currentScreen, goBack } = useNavigation();

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
      {currentScreen === 'home' && (
        <AppHeader
          operatorName={session.fullName}
          zone={session.zone}
          onLogout={logout}
          onZoneChange={(newZone) => updateZone(newZone)}
        />
      )}

      <View style={styles.content}>{renderScreen()}</View>

      {isMainTab && <BottomTabBar />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    position: 'relative',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
});

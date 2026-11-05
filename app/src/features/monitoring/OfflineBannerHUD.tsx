import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCurrentAccount } from '../../shared/api/identityApi';
import { useRealtime } from '../../shared/realtime';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  RefreshCw,
  WifiOff,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';

export function OfflineBannerHUD() {
  const { goBack } = useNavigation();
  const { isConnected } = useRealtime();
  const connection = useQuery({ queryKey: ['connection-check'], queryFn: getCurrentAccount, retry: false });

  return <View style={styles.container}>
    <SubScreenHeader label="Network Resiliency" title="Connection Status" onBack={goBack} />
    <View style={styles.banner}>
      <View style={styles.bannerLeft}>
        <View style={styles.bannerIconBox}><WifiOff size={18} color={colors.warningText} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Offline Actions Unavailable</Text>
          <Text style={styles.bannerSubtitle}>Unsent actions are not saved on this device or replayed automatically.</Text>
        </View>
      </View>
    </View>
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.queueCard}>
        <View style={styles.queueHeader}><Text style={styles.queueTitle}>Server Connection</Text></View>
        <Text style={styles.taskLabel}>{connection.isFetching ? 'Checking server…' : connection.error ? 'Server check failed. Reconnect and retry.' : connection.data ? 'Server responded to the last check.' : 'Server has not been checked.'}</Text>
        <Text style={styles.taskLabel}>Live updates: {isConnected ? 'Connected' : 'Disconnected'}. This is separate from the server check.</Text>
      </View>
      <View style={styles.queueCard}>
        <View style={styles.queueHeader}><Text style={styles.queueTitle}>If An Action Fails</Text></View>
        <Text style={styles.taskLabel}>Reconnect, reopen the Job or request, and check its current status before trying again. The server may have received an action even if its response was lost.</Text>
      </View>
      <Button label="Check Connection" icon={<RefreshCw size={18} color={colors.textInverse} />}
        onPress={() => { void connection.refetch(); }} loading={connection.isFetching} size="lg" />
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 158, 11, 0.25)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  bannerIconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b45309',
    fontFamily: typography.fontSans,
  },
  bannerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
    fontFamily: typography.fontSans,
  },
  retryPill: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  retryText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309',
    fontFamily: typography.fontMono,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  feedbackToast: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 12,
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  queueCard: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.panel,
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  queueTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  queueCount: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  taskLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  taskTime: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    fontFamily: typography.fontMono,
  },
});

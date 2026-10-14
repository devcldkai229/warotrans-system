import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Box,
  CheckCircle2,
  RefreshCw,
  WifiOff,
  Zap,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';

interface PendingTask {
  id: string;
  label: string;
  timestamp: string;
  status: 'queued' | 'synced';
}

const INITIAL_TASKS: PendingTask[] = [
  {
    id: 'tx-1',
    label: 'Handover BOX-101 (Dock 01)',
    timestamp: '19:12:04',
    status: 'queued',
  },
  {
    id: 'tx-2',
    label: 'Scan Verify BOX-102',
    timestamp: '19:12:45',
    status: 'queued',
  },
  {
    id: 'tx-3',
    label: 'Incident Report Rack A-02',
    timestamp: '19:13:10',
    status: 'queued',
  },
];

export function OfflineBannerHUD() {
  const { goBack } = useNavigation();
  const [tasks, setTasks] = useState<PendingTask[]>(INITIAL_TASKS);
  const [countdown, setCountdown] = useState(5);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isSyncing) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 5 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isSyncing]);

  const handleSimulateSync = () => {
    triggerHaptic('success');
    setIsSyncing(true);
    setFeedback('Wi-Fi link detected! Flushing offline queue to WMS gateway...');

    setTimeout(() => {
      setTasks((prev) => prev.map((t) => ({ ...t, status: 'synced' })));
      setIsSyncing(false);
      setFeedback('All 3 pending transactions successfully reconciled with WMS.');
      setTimeout(() => setFeedback(null), 3500);
    }, 1500);
  };

  const pendingCount = tasks.filter((t) => t.status !== 'synced').length;

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label="Network resiliency"
        title="Offline Operation Mode"
        onBack={goBack}
      />

      {/* Amber Reconnecting Banner */}
      <View style={styles.banner}>
        <View style={styles.bannerLeft}>
          <View style={styles.bannerIconBox}>
            <WifiOff size={18} color="#b45309" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Offline mode active</Text>
            <Text style={styles.bannerSubtitle}>
              {pendingCount} transactions cached safely in local device storage
            </Text>
          </View>
        </View>
        <View style={styles.retryPill}>
          <Text style={styles.retryText}>Retry in 0{countdown}s</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {feedback && (
          <View style={styles.feedbackToast}>
            <Text style={styles.feedbackText}>{feedback}</Text>
          </View>
        )}

        {/* Local Sync Queue Card */}
        <View style={styles.queueCard}>
          <View style={styles.queueHeader}>
            <Text style={styles.queueTitle}>Local sync queue</Text>
            <Text style={styles.queueCount}>
              {pendingCount} pending task{pendingCount !== 1 ? 's' : ''}
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            {tasks.map((t) => (
              <View key={t.id} style={styles.taskRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  {t.status === 'synced' ? (
                    <CheckCircle2 size={16} color="#16a34a" />
                  ) : (
                    <Box size={16} color="#b45309" />
                  )}
                  <Text style={styles.taskLabel} numberOfLines={1}>
                    {t.label}
                  </Text>
                </View>
                <Text style={styles.taskTime}>{t.timestamp}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Manual Sync Trigger in Warm Dark Gray */}
        <Button
          label={isSyncing ? 'Reconnecting to WMS gateway...' : 'Simulate Reconnect & Flush Queue'}
          icon={
            isSyncing ? (
              <RefreshCw size={18} color="#ffffff" />
            ) : (
              <Zap size={18} color="#ffffff" />
            )
          }
          onPress={handleSimulateSync}
          disabled={isSyncing || pendingCount === 0}
          variant="primary"
          size="lg"
          style={{ width: '100%', marginTop: 8 }}
        />
      </ScrollView>
    </View>
  );
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

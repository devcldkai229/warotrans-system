import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ArrowLeft,
  Box,
  CheckCircle2,
  RefreshCw,
  Zap,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';

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
    setIsSyncing(true);
    setFeedback('Wi-Fi link detected! Flushing offline queue to WMS gateway...');

    setTimeout(() => {
      setTasks((prev) => prev.map((t) => ({ ...t, status: 'synced' })));
      setIsSyncing(false);
      setFeedback('All 3 pending transactions successfully reconciled with WMS!');
      setTimeout(() => setFeedback(null), 3500);
    }, 1500);
  };

  const pendingCount = tasks.filter((t) => t.status !== 'synced').length;

  return (
    <View style={styles.container}>
      {/* Amber Reconnecting Banner */}
      <View style={styles.banner}>
        <View style={styles.bannerLeft}>
          <View style={styles.bannerIconBox}>
            <Zap size={16} color="#fbbf24" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>WMS NETWORK CONNECTION LOST (OFFLINE)</Text>
            <Text style={styles.bannerSubtitle}>
              3 handover transactions cached in local SQLite store
            </Text>
          </View>
        </View>
        <View style={styles.retryPill}>
          <Text style={styles.retryText}>RETRY 0{countdown}s</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {feedback && (
          <View style={styles.feedbackToast}>
            <Text style={styles.feedbackText}>{feedback}</Text>
          </View>
        )}

        {/* Header Content */}
        <View style={styles.headerSection}>
          <Text style={styles.headerTag}>SCR-STF-18 · OFFLINE RECONNECTING MODE</Text>
          <Text style={styles.headerTitle}>Offline Operation Mode</Text>
          <Text style={styles.headerDesc}>
            PDA terminal continues scanning and logging handovers without disrupting warehouse workflow.
          </Text>
        </View>

        {/* Local Sync Queue Card */}
        <View style={styles.queueCard}>
          <View style={styles.queueHeader}>
            <Text style={styles.queueTitle}>Local Sync Queue</Text>
            <Text style={styles.queueCount}>
              {pendingCount} Pending Sync Task{pendingCount !== 1 ? 's' : ''}
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            {tasks.map((t) => (
              <View key={t.id} style={styles.taskRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  {t.status === 'synced' ? (
                    <CheckCircle2 size={16} color={colors.success} />
                  ) : (
                    <Box size={16} color={colors.warning} />
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

        {/* Manual Sync Trigger */}
        <Button
          label={isSyncing ? 'Reconnecting to WMS Gateway...' : 'Simulate Reconnect & Sync'}
          icon={
            isSyncing ? (
              <RefreshCw size={16} color="#ffffff" />
            ) : (
              <RefreshCw size={16} color={colors.primary} />
            )
          }
          onPress={handleSimulateSync}
          variant={isSyncing ? 'primary' : 'outline'}
          size="md"
        />

        <Button
          label="Return to Operational Console"
          icon={<ArrowLeft size={16} color={colors.textPrimary} />}
          onPress={goBack}
          variant="secondary"
          size="lg"
          style={{ marginTop: 6 }}
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
    backgroundColor: '#f59e0b',
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...shadows.panel,
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  bannerIconBox: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 0.5,
    fontFamily: typography.fontSans,
  },
  bannerSubtitle: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(15, 23, 42, 0.85)',
    marginTop: 1,
  },
  retryPill: {
    backgroundColor: 'rgba(15, 23, 42, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  retryText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#0f172a',
    fontFamily: typography.fontMono,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  feedbackToast: {
    backgroundColor: colors.successSoft,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  feedbackText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.success,
  },
  headerSection: {
    marginTop: 4,
  },
  headerTag: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 1.2,
    fontFamily: typography.fontMono,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 4,
    fontFamily: typography.fontSans,
  },
  headerDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 4,
  },
  queueCard: {
    backgroundColor: colors.warningSoft,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.warningBorder,
    padding: 14,
    gap: 10,
    ...shadows.panel,
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 4,
  },
  queueTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.warning,
  },
  queueCount: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.warning,
    fontFamily: typography.fontMono,
  },
  taskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  taskLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  taskTime: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    fontFamily: typography.fontMono,
  },
});

import React, { useState, useEffect } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { colors } from '../../shared/theme/colors';
import { Badge } from '../../shared/components/Badge';

interface PendingTask {
  id: string;
  type: string;
  label: string;
  timestamp: string;
  status: 'queued' | 'syncing' | 'synced';
}

const INITIAL_TASKS: PendingTask[] = [
  {
    id: 'tx-1',
    type: 'handover',
    label: '📦 Handover BOX-101 (Dock 01)',
    timestamp: '19:12:04',
    status: 'queued',
  },
  {
    id: 'tx-2',
    type: 'verify',
    label: '📦 Scan Verify BOX-102',
    timestamp: '19:12:45',
    status: 'queued',
  },
  {
    id: 'tx-3',
    type: 'incident',
    label: '⚠️ Incident Report Rack A-02',
    timestamp: '19:13:10',
    status: 'queued',
  },
];

export function OfflineBannerHUD() {
  const { goBack, navigate } = useNavigation();
  const [tasks, setTasks] = useState<PendingTask[]>(INITIAL_TASKS);
  const [isSyncing, setIsSyncing] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isSyncing) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          return 5;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isSyncing]);

  const handleSimulateSync = () => {
    setIsSyncing(true);
    setToastMessage('Wi-Fi link detected! Flushing offline queue to WMS gateway...');

    // Simulate task syncing sequentially
    setTimeout(() => {
      setTasks((prev) =>
        prev.map((t, idx) => (idx === 0 ? { ...t, status: 'synced' } : t))
      );
    }, 700);

    setTimeout(() => {
      setTasks((prev) =>
        prev.map((t, idx) => (idx <= 1 ? { ...t, status: 'synced' } : t))
      );
    }, 1400);

    setTimeout(() => {
      setTasks((prev) => prev.map((t) => ({ ...t, status: 'synced' })));
      setIsSyncing(false);
      setToastMessage('✅ All 3 pending transactions successfully reconciled with WMS!');
      setTimeout(() => setToastMessage(null), 4000);
    }, 2200);
  };

  const pendingCount = tasks.filter((t) => t.status !== 'synced').length;

  return (
    <View style={styles.container}>
      {/* Toast Alert */}
      {toastMessage && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      {/* Amber Offline Alert Banner */}
      <View style={styles.alertBanner}>
        <View style={styles.bannerLeft}>
          <View style={styles.boltBadge}>
            <Text style={styles.boltText}>⚡</Text>
          </View>
          <View style={styles.bannerInfo}>
            <Text style={styles.bannerTitle}>WMS NETWORK CONNECTION LOST (OFFLINE)</Text>
            <Text style={styles.bannerSubtitle}>
              {pendingCount > 0
                ? `${pendingCount} handover transactions cached in local SQLite store`
                : 'All local records synced. Connection standby.'}
            </Text>
          </View>
        </View>
        <Pressable
          style={styles.retryBadge}
          onPress={handleSimulateSync}
          disabled={isSyncing}
        >
          <Text style={styles.retryBadgeText}>
            {isSyncing ? 'SYNCING...' : `RETRY ${countdown.toString().padStart(2, '0')}s`}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* Screen Header */}
        <View style={styles.header}>
          <Text style={styles.tag}>SCR-STF-18 · OFFLINE RECONNECTING MODE</Text>
          <Text style={styles.title}>Offline Operation Mode</Text>
          <Text style={styles.description}>
            PDA terminal continues scanning and logging handovers without disrupting warehouse workflow.
            Transactions will automatically synchronize once Wi-Fi 6 mesh or 5G coverage is re-established.
          </Text>
        </View>

        {/* Telemetry Diagnostics Card */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>NETWORK & STORAGE DIAGNOSTICS</Text>
          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Wi-Fi 6 Connection</Text>
            <Badge label="DISCONNECTED" tone="danger" />
          </View>
          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Local SQLite Cache</Text>
            <Text style={styles.diagValueMono}>3 entries (4.2 KB / 100 MB)</Text>
          </View>
          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Last Gateway Handshake</Text>
            <Text style={styles.diagValueMono}>19:11:42 (1m 28s ago)</Text>
          </View>
          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Nav2 Telemetry Proxy</Text>
            <Badge label="STANDBY" tone="warning" />
          </View>
        </View>

        {/* Local Sync Queue Card */}
        <View style={styles.queueCard}>
          <View style={styles.queueHeader}>
            <Text style={styles.queueTitle}>Local Sync Queue</Text>
            <Badge
              label={`${pendingCount} Pending Sync Task${pendingCount !== 1 ? 's' : ''}`}
              tone={pendingCount > 0 ? 'warning' : 'success'}
            />
          </View>

          <View style={styles.taskList}>
            {tasks.map((task) => (
              <View key={task.id} style={styles.taskItem}>
                <View style={styles.taskInfo}>
                  <Text style={styles.taskLabel}>{task.label}</Text>
                  <Text style={styles.taskTime}>{task.timestamp}</Text>
                </View>
                <Badge
                  label={
                    task.status === 'synced'
                      ? 'SYNCED'
                      : isSyncing
                      ? 'UPLOADING'
                      : 'QUEUED'
                  }
                  tone={
                    task.status === 'synced'
                      ? 'success'
                      : isSyncing
                      ? 'info'
                      : 'neutral'
                  }
                />
              </View>
            ))}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionSection}>
          <Pressable
            style={[styles.primaryBtn, isSyncing && styles.btnDisabled]}
            onPress={handleSimulateSync}
            disabled={isSyncing}
          >
            <Text style={styles.primaryBtnText}>
              {isSyncing ? 'Synchronizing with WMS Gateway...' : '⚡ Test Connection & Force Flush Queue'}
            </Text>
          </Pressable>

          <Pressable
            style={styles.outlineBtn}
            onPress={() => {
              if (goBack) {
                goBack();
              } else {
                navigate('home');
              }
            }}
          >
            <Text style={styles.outlineBtnText}>← Return to Operational Console</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  toast: {
    position: 'absolute',
    top: 55,
    left: 16,
    right: 16,
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38bdf8',
    zIndex: 99,
  },
  toastText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  alertBanner: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  boltBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  boltText: {
    fontSize: 14,
    color: '#fbbf24',
    fontWeight: '900',
  },
  bannerInfo: {
    flex: 1,
  },
  bannerTitle: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  bannerSubtitle: {
    color: '#1e293b',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  retryBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
  },
  retryBadgeText: {
    color: '#0f172a',
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '900',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
  },
  tag: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 4,
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 16,
  },
  cardHeader: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '900',
    color: colors.textMuted,
    marginBottom: 12,
    letterSpacing: 0.8,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  diagLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  diagValueMono: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: colors.textSecondary,
    fontWeight: '700',
  },
  queueCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    padding: 14,
    marginBottom: 20,
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  queueTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  taskList: {
    gap: 8,
  },
  taskItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  taskInfo: {
    flex: 1,
    marginRight: 8,
  },
  taskLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  taskTime: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: colors.textMuted,
    marginTop: 2,
  },
  actionSection: {
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  outlineBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  outlineBtnText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
});

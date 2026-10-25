import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  AlertOctagon,
  AlertTriangle,
  Battery,
  BatteryMedium,
  CheckCircle2,
  Compass,
  History,
  Power,
  Radio,
  RefreshCw,
  ShieldAlert,
  Wifi,
  WifiOff,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useToast } from '../../shared/context/ToastContext';
import { Button } from '../../shared/components/Button';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';
import { Text } from '../../shared/ui/Text';
import { StatusPill } from '../../shared/ui/StatusPill';
import { useRealtime } from '../../shared/realtime';
import { cancelRobotCommand, listRobots, RobotDto } from '../../shared/api';

interface RobotUiItem extends Omit<RobotDto, 'status'> {
  status: string;
  recalledAt?: string;
  pendingTargetCommandId?: string | null;
}

interface RecallAuditEntry {
  id: string;
  robotCode: string;
  reason: string;
  timestamp: string;
  status: 'CANCEL_REQUESTED_202';
}

const nowTimeLabel = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const hasActiveRobotCommand = (robot: RobotUiItem) =>
  Boolean(robot.currentCommandId) || robot.status.toUpperCase() === 'BUSY' || robot.status.toUpperCase() === 'EXECUTING';

export function FleetRecallScreen() {
  const { goBack } = useNavigation();
  const { success: showToastSuccess, error: showToastError } = useToast();
  const { robotTelemetry, robotConnectivity, isConnected } = useRealtime();

  const [robots, setRobots] = useState<RobotUiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recallingMap, setRecallingMap] = useState<Record<string, boolean>>({});
  const [isRecallingAll, setIsRecallingAll] = useState(false);
  const [auditLog, setAuditLog] = useState<RecallAuditEntry[]>([]);

  const [selectedRobotForRecall, setSelectedRobotForRecall] = useState<RobotUiItem | null>(null);

  const fetchFleet = async () => {
    setIsLoading(true);
    try {
      const res = await listRobots();
      if (res && res.items) {
        setRobots(previous => res.items.map(robot => {
          const pending = previous.find(item => item.id === robot.id);
          const stillPending = Boolean(pending?.pendingTargetCommandId && pending.pendingTargetCommandId === robot.currentCommandId);
          return { ...robot, currentCommandId: robot.currentCommandId ?? null,
            recalledAt: stillPending ? pending?.recalledAt : undefined,
            pendingTargetCommandId: stillPending ? pending?.pendingTargetCommandId : null };
        }));
      }
    } catch (err: any) {
      console.warn('Failed to load fleet robots:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFleet();
    const poll = setInterval(fetchFleet, 10000);
    return () => clearInterval(poll);
  }, []);

  // Merge backend robot entities with live SignalR telemetry and connectivity updates
  const mergedRobots = useMemo(() => {
    return robots.map((robot) => {
      const liveTelem = robotTelemetry[robot.code];
      const liveConn = robotConnectivity[robot.code];

      return {
        ...robot,
        isOnline: liveConn ? liveConn.isOnline : robot.isOnline,
        // A cancel acceptance is pending until a later fleet refresh confirms robot state.
        status: liveConn?.status || robot.status,
        batteryPercent:
          liveTelem && typeof liveTelem.batteryPercent === 'number'
            ? liveTelem.batteryPercent
            : robot.batteryPercent,
        poseX:
          liveTelem && typeof liveTelem.poseX === 'number'
            ? liveTelem.poseX
            : robot.poseX,
        poseY:
          liveTelem && typeof liveTelem.poseY === 'number'
            ? liveTelem.poseY
            : robot.poseY,
        poseYaw:
          liveTelem && typeof liveTelem.poseYaw === 'number'
            ? liveTelem.poseYaw
            : robot.poseYaw,
        navigationStatus:
          liveTelem?.navigationStatus
            ? (liveTelem.navigationStatus as any)
            : robot.navigationStatus,
      };
    });
  }, [robots, robotTelemetry, robotConnectivity]);

  const handleRecallSingle = async (robot: RobotUiItem, reasonText?: string) => {
    const selectedReason = reasonText || 'Operator manual emergency recall from mobile console';
    const reason = `Operator recall from Mobile App (${selectedReason})`;
    const hasActiveCommand = hasActiveRobotCommand(robot);
    if (!hasActiveCommand || !robot.isOnline) { showToastError('There is no active online command to cancel.'); return; }
    triggerHaptic('warning');
    setRecallingMap((prev) => ({ ...prev, [robot.id]: true }));

    try {
      const response = await cancelRobotCommand(robot.id, reason, robot.currentCommandId);
      triggerHaptic('success');
      showToastSuccess(`Cancel Requested (202 Accepted) for ${robot.code} · Awaiting Robot ACK`);

      // Add to audit trail
      setAuditLog((prev) => [
        {
          id: `REC-${Math.floor(1000 + Math.random() * 9000)}`,
          robotCode: robot.code,
          reason,
          timestamp: nowTimeLabel(),
          status: 'CANCEL_REQUESTED_202',
        },
        ...prev,
      ]);

      // Record acceptance without claiming a physical stop or navigation ACK.
      setRobots((prev) =>
        prev.map((r) =>
          r.id === robot.id
            ? { ...r, pendingTargetCommandId: response.targetCommandId, recalledAt: nowTimeLabel() }
            : r,
        ),
      );
    } catch (err: any) {
      triggerHaptic('error');
      showToastError(`Recall failed for ${robot.code}: ${err?.message || 'Network error'}`);
    } finally {
      setRecallingMap((prev) => ({ ...prev, [robot.id]: false }));
      setSelectedRobotForRecall(null);
    }
  };

  const handleRecallAllRobots = async () => {
    triggerHaptic('error');
    setIsRecallingAll(true);

    try {
      const targets = mergedRobots.filter(robot => robot.isOnline && hasActiveRobotCommand(robot) && !robot.recalledAt);
      if (!targets.length) { showToastSuccess('No active online commands require cancellation.'); return; }

      const results = await Promise.allSettled(
        targets.map((r) =>
          cancelRobotCommand(r.id, 'Global facility emergency recall issued by Shift Supervisor', r.currentCommandId),
        ),
      );

      const accepted = targets.filter((robot, index) => results[index].status === 'fulfilled');
      const failed = targets.filter((robot, index) => results[index].status === 'rejected');
      if (failed.length) showToastError(`Recall failed for ${failed.map((r) => r.code).join(', ')} · Retry Required`);
      if (!accepted.length) return;

      triggerHaptic('success');
      showToastSuccess(`Emergency Fleet Recall sent (${accepted.length} commands · 202 Accepted · Awaiting ACK)`);

      setAuditLog((prev) => [
        ...accepted.map((robot): RecallAuditEntry => ({
          id: `ALL-${Math.floor(1000 + Math.random() * 9000)}`,
          robotCode: robot.code,
          reason: 'Global emergency stop / recall all',
          timestamp: nowTimeLabel(),
          status: 'CANCEL_REQUESTED_202',
        })),
        ...prev,
      ]);

      // Keep accepted cancellations pending until fleet state is refreshed.
      setRobots((prev) =>
        prev.map((r) => {
          const target = accepted.find((robot) => robot.id === r.id);
          return target ? {
            ...r,
            pendingTargetCommandId: target.currentCommandId,
            recalledAt: nowTimeLabel(),
          } : r;
        }),
      );
    } catch (err: any) {
      showToastError(`Global recall error: ${err?.message || 'Request failed'}`);
    } finally {
      setIsRecallingAll(false);
    }
  };

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label="Safety & Fleet Controls"
        title="Fleet Command Cancellation"
        onBack={goBack}
        rightAction={
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              fetchFleet();
            }}
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Refresh fleet list"
          >
            <RefreshCw size={18} color={colors.textPrimary} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Global Emergency Stop / Recall All Banner */}
        <View style={styles.emergencyCard}>
          <View style={styles.emergencyTopRow}>
            <View style={styles.emergencyBadge}>
              <AlertOctagon size={24} color="#ffffff" strokeWidth={2.4} />
            </View>
            <View style={styles.emergencyTextWrap}>
              <Text variant="headline" style={styles.emergencyTitle}>
                Facility Emergency Recall
              </Text>
              <Text variant="caption" style={styles.emergencySubtitle}>
                Request cancellation of active commands across the fleet. Await robot ACK; idle units are skipped.
              </Text>
            </View>
          </View>

          <Button
            label={isRecallingAll ? 'Dispatching Global Recall...' : 'RECALL ALL FLEET ROBOTS'}
            variant="danger"
            size="lg"
            loading={isRecallingAll}
            disabled={isRecallingAll}
            onPress={() => {
              if (Platform.OS === 'web') {
                if (window.confirm('Are you sure you want to trigger an Emergency Recall for ALL robots?')) {
                  handleRecallAllRobots();
                }
              } else {
                Alert.alert(
                  'Emergency Recall All Robots',
                  'This requests cancellation of active robot commands. Robot ACK is required to confirm a stop; idle robots are skipped. Continue?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Issue Recall All', style: 'destructive', onPress: handleRecallAllRobots },
                  ],
                );
              }
            }}
            icon={<ShieldAlert size={20} color="#ffffff" strokeWidth={2.4} />}
            style={styles.recallAllBtn}
          />
        </View>

        {/* Live Fleet Section */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleGroup}>
            <Radio size={16} color={colors.primary} />
            <Text variant="title" color={colors.textPrimary} style={styles.sectionTitle}>
              Monitored AMR Fleet ({mergedRobots.length})
            </Text>
          </View>

          <View style={styles.connIndicator}>
            <View style={[styles.pulseDot, isConnected ? styles.pulseDotOnline : styles.pulseDotOffline]} />
            <Text variant="caption" color={isConnected ? colors.successText : colors.textSecondary}>
              {isConnected ? 'SignalR Live' : 'Polling Fallback'}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text variant="caption" color={colors.textSecondary} style={styles.loadingText}>
              Connecting to Fleet Management Service...
            </Text>
          </View>
        ) : (
          <View style={styles.robotList}>
            {mergedRobots.map((robot) => {
              const isRecallingThis = recallingMap[robot.id] || false;
              const isOnline = robot.isOnline;

              return (
                <View key={robot.id} style={styles.robotCard}>
                  {/* Robot Header */}
                  <View style={styles.robotHeader}>
                    <View style={styles.robotNameGroup}>
                      <Text style={styles.robotCode}>{robot.code}</Text>
                      <Text variant="caption" color={colors.textSecondary} style={styles.robotName}>
                        {robot.name || 'WaroTrans Carrier Unit'}
                      </Text>
                    </View>

                    <View style={styles.statusGroup}>
                      <View style={[styles.onlineTag, isOnline ? styles.onlineTagActive : styles.onlineTagInactive]}>
                        {isOnline ? (
                          <Wifi size={12} color="#166534" />
                        ) : (
                          <WifiOff size={12} color="#991b1b" />
                        )}
                        <Text style={[styles.onlineTagText, isOnline ? styles.onlineTextActive : styles.onlineTextInactive]}>
                          {isOnline ? 'ONLINE' : 'OFFLINE'}
                        </Text>
                      </View>
                      <StatusPill status={robot.status} label={robot.recalledAt ? 'Cancel Requested · Awaiting ACK' : robot.status} size="sm" dot />
                    </View>
                  </View>

                  {/* Telemetry Metrics Grid */}
                  <View style={styles.telemetryGrid}>
                    <View style={styles.telemetryCell}>
                      <View style={styles.metricLabelRow}>
                        <Battery size={13} color={colors.textSecondary} />
                        <Text variant="caption" color={colors.textSecondary}>Battery</Text>
                      </View>
                      <Text style={[styles.metricValue, robot.batteryPercent < 20 && styles.batteryLow]}>
                        {Math.round(robot.batteryPercent)}%
                      </Text>
                    </View>

                    <View style={styles.telemetryCell}>
                      <View style={styles.metricLabelRow}>
                        <Compass size={13} color={colors.textSecondary} />
                        <Text variant="caption" color={colors.textSecondary}>Pose (X, Y)</Text>
                      </View>
                      <Text style={styles.metricValue}>
                        {robot.poseX.toFixed(1)}m, {robot.poseY.toFixed(1)}m
                      </Text>
                    </View>

                    <View style={styles.telemetryCell}>
                      <View style={styles.metricLabelRow}>
                        <Radio size={13} color={colors.textSecondary} />
                        <Text variant="caption" color={colors.textSecondary}>Navigation</Text>
                      </View>
                      <Text style={styles.metricValue}>
                        {robot.navigationStatus || 'STANDBY'}
                      </Text>
                    </View>
                  </View>

                  {/* Active Command Tag if running */}
                  {robot.currentCommandId ? (
                    <View style={styles.commandBanner}>
                      <Text variant="caption" color={colors.textSecondary}>
                        Active Command: <Text style={styles.commandIdText}>{robot.currentCommandId.slice(0, 16)}...</Text>
                      </Text>
                    </View>
                  ) : null}

                  {/* Individual Emergency Action */}
                  <View style={styles.robotActionRow}>
                    <Button
                      label={isRecallingThis ? 'Canceling...' : `Cancel Command · ${robot.code}`}
                      variant={robot.status === 'PAUSED' ? 'secondary' : 'danger'}
                      size="md"
                      loading={isRecallingThis}
                      disabled={isRecallingThis || !isOnline || !hasActiveRobotCommand(robot) || Boolean(robot.recalledAt)}
                      icon={<AlertTriangle size={16} color={robot.status === 'PAUSED' ? colors.textPrimary : '#ffffff'} />}
                      onPress={() => handleRecallSingle(robot)}
                      style={styles.singleRecallBtn}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Audit Log Section */}
        <View style={styles.auditSection}>
          <View style={styles.auditHeader}>
            <History size={16} color={colors.textSecondary} />
            <Text variant="title" color={colors.textPrimary} style={styles.auditTitle}>
              Recall Dispatch Log
            </Text>
          </View>

          <View style={styles.auditCard}>
            {auditLog.map((log, idx) => (
              <View
                key={log.id}
                style={[
                  styles.auditRow,
                  idx < auditLog.length - 1 && styles.auditRowBorder,
                ]}
              >
                <View style={styles.auditRowTop}>
                  <Text style={styles.auditRobotCode}>{log.robotCode}</Text>
                  <View style={styles.auditStatusBadge}>
                    <CheckCircle2 size={12} color="#16a34a" />
                    <Text style={styles.auditStatusText}>202 CANCEL SENT</Text>
                  </View>
                </View>
                <Text variant="caption" color={colors.textSecondary} style={styles.auditReason}>
                  {log.reason}
                </Text>
                <Text variant="caption" color={colors.textMuted} style={styles.auditTime}>
                  {log.timestamp} · {log.id}
                </Text>
              </View>
            ))}
          </View>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 20,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  /* Emergency Card */
  emergencyCard: {
    backgroundColor: '#7f1d1d',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#991b1b',
    ...shadows.md,
  },
  emergencyTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 16,
  },
  emergencyBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#991b1b',
    borderWidth: 1.5,
    borderColor: '#f87171',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emergencyTextWrap: {
    flex: 1,
    gap: 4,
  },
  emergencyTitle: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 17,
    letterSpacing: 0.4,
  },
  emergencySubtitle: {
    color: '#fecaca',
    lineHeight: 18,
    fontSize: 12,
  },
  recallAllBtn: {
    backgroundColor: '#dc2626',
    borderBottomColor: '#7f1d1d',
  },
  /* Section Header */
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontWeight: '800',
    fontSize: 15,
  },
  connIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pulseDotOnline: {
    backgroundColor: '#16a34a',
  },
  pulseDotOffline: {
    backgroundColor: '#eab308',
  },
  /* Loading Box */
  loadingBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
  },
  /* Robot Card */
  robotList: {
    gap: 14,
  },
  robotCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.sm,
  },
  robotHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  robotNameGroup: {
    gap: 2,
  },
  robotCode: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
    letterSpacing: 0.5,
  },
  robotName: {
    fontSize: 11,
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onlineTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  onlineTagActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  onlineTagInactive: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  onlineTagText: {
    fontSize: 9,
    fontWeight: '800',
  },
  onlineTextActive: {
    color: '#166534',
  },
  onlineTextInactive: {
    color: '#991b1b',
  },
  /* Telemetry Grid */
  telemetryGrid: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 10,
    gap: 8,
    marginBottom: 12,
  },
  telemetryCell: {
    flex: 1,
    gap: 3,
  },
  metricLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: typography.fontMono,
    color: colors.textPrimary,
  },
  batteryLow: {
    color: '#dc2626',
  },
  commandBanner: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  commandIdText: {
    fontFamily: typography.fontMono,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  robotActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  singleRecallBtn: {
    flex: 1,
  },
  /* Audit Log */
  auditSection: {
    marginTop: 8,
    gap: 10,
  },
  auditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  auditTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  auditCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 4,
    ...shadows.sm,
  },
  auditRow: {
    paddingVertical: 10,
    gap: 3,
  },
  auditRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  auditRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  auditRobotCode: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: typography.fontMono,
    color: colors.textPrimary,
  },
  auditStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  auditStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16a34a',
  },
  auditReason: {
    fontSize: 11,
  },
  auditTime: {
    fontSize: 10,
    marginTop: 2,
  },
});

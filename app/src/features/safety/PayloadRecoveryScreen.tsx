import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Box,
  Check,
  CheckCircle2,
  LifeBuoy,
  Navigation,
  RefreshCw,
  ScanLine,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';

type RescuePhase = 'briefing' | 'rendezvous' | 'transfer' | 'resuming' | 'completed';

export function PayloadRecoveryScreen() {
  const { goBack } = useNavigation();
  const [phase, setPhase] = useState<RescuePhase>('briefing');
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleDispatchRescue = () => {
    triggerHaptic('success');
    setPhase('rendezvous');
    setFeedback('Emergency rescue: AMR-02 dispatched to rendezvous coordinates (X: 12.4m, Y: 8.2m).');
    setTimeout(() => {
      setPhase('transfer');
      setFeedback('AMR-02 arrived at scene. Parked 1.0m from stalled AMR-01.');
    }, 2000);
  };

  const handleScanStrandedTote = () => {
    triggerHaptic('success');
    setScannedBarcode('BOX-101');
    setFeedback('Barcode BOX-101 matched stranded cargo.');
  };

  const handleResumeMission = () => {
    triggerHaptic('success');
    setPhase('resuming');
    setTimeout(() => {
      setPhase('completed');
      setFeedback('Job JOB-2026-0812 successfully transferred to AMR-02. Resuming dropoff.');
    }, 1500);
  };

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label="Payload recovery"
        title="Emergency Cargo Rescue"
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {feedback && (
          <View style={styles.feedbackToast}>
            <Text style={styles.feedbackText}>{feedback}</Text>
          </View>
        )}

        {phase === 'completed' ? (
          <View style={styles.completedCard}>
            <View style={styles.completedIconBadge}>
              <Check size={24} color="#16a34a" />
            </View>
            <Text style={styles.completedTitle}>Cargo rescue succeeded</Text>
            <Text style={styles.completedSub}>
              AMR-02 has assumed mission execution and is en route to Rack A.
            </Text>

            <View style={styles.receiptBox}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Original mission</Text>
                <Text style={styles.receiptVal}>JOB-2026-0812</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Rescued container</Text>
                <Text style={styles.receiptHighlight}>BOX-101 (45 units)</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Active carrier</Text>
                <Text style={styles.receiptSuccess}>AMR-02 (Healthy)</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Target destination</Text>
                <Text style={styles.receiptVal}>Rack A · Level 2 · Bin 03</Text>
              </View>
              <View style={[styles.receiptRow, styles.receiptBorderTop]}>
                <Text style={styles.receiptLabel}>Faulted unit</Text>
                <Text style={styles.receiptDanger}>AMR-01 (Flagged for towing)</Text>
              </View>
            </View>

            <Button
              label="Back to hub"
              onPress={goBack}
              variant="primary"
              size="lg"
              style={{ width: '100%', marginTop: 18 }}
            />
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {/* Critical Alert Banner */}
            <View style={styles.alertCard}>
              <View style={styles.alertIconBox}>
                <LifeBuoy size={22} color="#dc2626" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.alertBadgeRow}>
                  <View style={styles.alertBadge}>
                    <Text style={styles.alertBadgeText}>Fleet incident</Text>
                  </View>
                  <Text style={styles.alertRobotText}>AMR-01 Stalled</Text>
                </View>
                <Text style={styles.alertTitle}>Payload recovery protocol required</Text>
              </View>
            </View>

            {/* Stepper Progress */}
            <View style={styles.stepperBox}>
              <View style={styles.stepItem}>
                <View
                  style={[
                    styles.stepNum,
                    (phase === 'briefing' || phase === 'rendezvous') && styles.stepNumActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.stepNumText,
                      (phase === 'briefing' || phase === 'rendezvous') && styles.stepNumTextActive,
                    ]}
                  >
                    1
                  </Text>
                </View>
                <Text
                  style={[
                    styles.stepText,
                    (phase === 'briefing' || phase === 'rendezvous') && styles.stepTextActive,
                  ]}
                >
                  Rendezvous
                </Text>
              </View>
              <Text style={styles.stepArrow}>➔</Text>
              <View style={styles.stepItem}>
                <View
                  style={[
                    styles.stepNum,
                    phase === 'transfer' && styles.stepNumActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.stepNumText,
                      phase === 'transfer' && styles.stepNumTextActive,
                    ]}
                  >
                    2
                  </Text>
                </View>
                <Text
                  style={[
                    styles.stepText,
                    phase === 'transfer' && styles.stepTextActive,
                  ]}
                >
                  Transfer & scan
                </Text>
              </View>
              <Text style={styles.stepArrow}>➔</Text>
              <View style={styles.stepItem}>
                <View
                  style={[
                    styles.stepNum,
                    phase === 'resuming' && styles.stepNumActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.stepNumText,
                      phase === 'resuming' && styles.stepNumTextActive,
                    ]}
                  >
                    3
                  </Text>
                </View>
                <Text
                  style={[
                    styles.stepText,
                    phase === 'resuming' && styles.stepTextActive,
                  ]}
                >
                  Resume
                </Text>
              </View>
            </View>

            {/* Diagnostics Cards */}
            <View style={styles.diagRow}>
              <View style={styles.diagFaulted}>
                <Text style={styles.diagLabel}>Faulted robot</Text>
                <Text style={styles.diagRobotId}>AMR-01</Text>
                <Text style={styles.diagDetail}>Error: Drive motor stall</Text>
                <View style={styles.diagPillFaulted}>
                  <Text style={styles.diagPillTextFaulted}>Pos: (12.4m, 8.2m)</Text>
                </View>
              </View>

              <View style={styles.diagRescue}>
                <Text style={styles.diagLabel}>Rescue robot</Text>
                <Text style={styles.diagRobotId}>AMR-02</Text>
                <Text style={styles.diagDetail}>Battery: 92% · Deck empty</Text>
                <View style={styles.diagPillRescue}>
                  <Text style={styles.diagPillTextRescue}>Status: Ready</Text>
                </View>
              </View>
            </View>

            {/* Stranded Cargo Info */}
            <View style={styles.cargoCard}>
              <Text style={styles.cargoTitle}>Stranded cargo onboard</Text>
              <View style={styles.cargoRow}>
                <View style={styles.cargoLeft}>
                  <Box size={18} color={colors.textSecondary} />
                  <View>
                    <Text style={styles.cargoCode}>BOX-101</Text>
                    <Text style={styles.cargoDesc}>
                      Electronic Components (<Text style={styles.boldUnits}>45 units</Text>)
                    </Text>
                  </View>
                </View>
                <View style={styles.cargoRight}>
                  <Text style={styles.cargoDestLabel}>Final destination</Text>
                  <Text style={styles.cargoDestVal}>Rack A · Level 2 · Bin 03</Text>
                </View>
              </View>
            </View>

            {/* Phase Actions with Warm Dark Gray CTAs */}
            {phase === 'briefing' && (
              <View style={styles.actionCard}>
                <Text style={styles.actionTitle}>Step 1: Dispatch rendezvous</Text>
                <Text style={styles.actionDesc}>
                  Command AMR-02 to navigate autonomously to coordinate (X: 12.4m, Y: 8.2m). AMR-02 will park 1.0 meter away from AMR-01 for safe manual tote transfer.
                </Text>
                <Button
                  label="Dispatch Rescue"
                  icon={<Navigation size={18} color="#ffffff" />}
                  onPress={handleDispatchRescue}
                  variant="primary"
                  size="lg"
                  style={{ marginTop: 12 }}
                />
              </View>
            )}

            {phase === 'rendezvous' && (
              <View style={styles.actionCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <RefreshCw size={16} color={colors.primary} />
                  <Text style={styles.actionTitle}>AMR-02 en route to scene</Text>
                </View>
                <Text style={styles.actionDesc}>
                  Navigating transit corridor. ETA 15 seconds. Please set up perimeter safety cones.
                </Text>
              </View>
            )}

            {phase === 'transfer' && (
              <View style={styles.actionCard}>
                <Text style={styles.actionTitle}>Step 2: Transfer stranded tote & scan barcode</Text>
                <Text style={styles.actionDesc}>
                  Physically move container BOX-101 from AMR-01 Bay 1 to AMR-02 Bay 1, then scan barcode to verify.
                </Text>

                {scannedBarcode ? (
                  <View style={styles.verifiedBox}>
                    <CheckCircle2 size={18} color="#16a34a" />
                    <Text style={styles.verifiedText}>Barcode verified: {scannedBarcode}</Text>
                  </View>
                ) : (
                  <Button
                    label="Simulate scan barcode (BOX-101)"
                    icon={<ScanLine size={16} color={colors.textPrimary} />}
                    onPress={handleScanStrandedTote}
                    variant="outline"
                    size="md"
                    style={{ marginTop: 10 }}
                  />
                )}

                <Button
                  label="Confirm Transfer & Resume Mission"
                  icon={<Check size={18} color="#ffffff" />}
                  onPress={handleResumeMission}
                  disabled={!scannedBarcode}
                  variant="primary"
                  size="lg"
                  style={{ marginTop: 12 }}
                />
              </View>
            )}

            {phase === 'resuming' && (
              <View style={styles.actionCard}>
                <Text style={styles.actionTitle}>Re-assigning mission to AMR-02...</Text>
                <Text style={styles.actionDesc}>
                  Updating Central FMS dispatch records and Nav2 dropoff route.
                </Text>
              </View>
            )}
          </View>
        )}
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
    paddingBottom: 48,
  },
  feedbackToast: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 14,
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  completedCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    padding: 18,
    ...shadows.panel,
  },
  completedIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  completedTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  completedSub: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 16,
    fontFamily: typography.fontSans,
  },
  receiptBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  receiptVal: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  receiptHighlight: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  receiptSuccess: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16a34a',
    fontFamily: typography.fontMono,
  },
  receiptDanger: {
    fontSize: 13,
    fontWeight: '700',
    color: '#dc2626',
    fontFamily: typography.fontMono,
  },
  receiptBorderTop: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginTop: 2,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
    borderRadius: radii.lg,
    padding: 16,
    ...shadows.panel,
  },
  alertIconBox: {
    width: 42,
    height: 42,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertBadge: {
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  alertBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
    fontFamily: typography.fontSans,
  },
  alertRobotText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 4,
    fontFamily: typography.fontSans,
  },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumActive: {
    backgroundColor: colors.darkAction,
    borderColor: colors.darkAction,
  },
  stepNumText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.fontMono,
  },
  stepNumTextActive: {
    color: '#ffffff',
  },
  stepText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  stepTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  stepArrow: {
    fontSize: 13,
    color: colors.textMuted,
  },
  diagRow: {
    flexDirection: 'row',
    gap: 10,
  },
  diagFaulted: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
    padding: 14,
    ...shadows.panel,
  },
  diagRescue: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.25)',
    padding: 14,
    ...shadows.panel,
  },
  diagLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  diagRobotId: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 4,
    fontFamily: typography.fontMono,
  },
  diagDetail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginVertical: 6,
    fontFamily: typography.fontSans,
  },
  diagPillFaulted: {
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  diagPillTextFaulted: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
    fontFamily: typography.fontMono,
  },
  diagPillRescue: {
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  diagPillTextRescue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a',
    fontFamily: typography.fontSans,
  },
  cargoCard: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.panel,
  },
  cargoTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 10,
    fontFamily: typography.fontSans,
  },
  cargoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cargoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cargoCode: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  cargoDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  boldUnits: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cargoRight: {
    alignItems: 'flex-end',
  },
  cargoDestLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  cargoDestVal: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  actionCard: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.panel,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  actionDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 4,
    fontFamily: typography.fontSans,
  },
  verifiedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.25)',
    padding: 12,
    borderRadius: radii.md,
    marginTop: 10,
  },
  verifiedText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16a34a',
    fontFamily: typography.fontMono,
  },
});

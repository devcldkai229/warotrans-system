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
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';

type RescuePhase = 'briefing' | 'rendezvous' | 'transfer' | 'resuming' | 'completed';

export function PayloadRecoveryScreen() {
  const { goBack } = useNavigation();
  const [phase, setPhase] = useState<RescuePhase>('briefing');
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleDispatchRescue = () => {
    setPhase('rendezvous');
    setFeedback('Emergency rescue: AMR-02 dispatched to rendezvous coordinates (X: 12.4m, Y: 8.2m).');
    setTimeout(() => {
      setPhase('transfer');
      setFeedback('AMR-02 arrived at scene. Parked 1.0m from stalled AMR-01.');
    }, 2000);
  };

  const handleScanStrandedTote = () => {
    setScannedBarcode('BOX-101');
    setFeedback('Barcode BOX-101 matched stranded cargo.');
  };

  const handleResumeMission = () => {
    setPhase('resuming');
    setTimeout(() => {
      setPhase('completed');
      setFeedback('Job JOB-2026-0812 successfully transferred to AMR-02. Resuming dropoff.');
    }, 1500);
  };

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label="SCR-STF-11-RESCUE"
        title="Emergency Payload Recovery"
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {feedback && (
          <View style={styles.feedbackToast}>
            <Text style={styles.feedbackText}>{feedback}</Text>
          </View>
        )}

        {phase === 'completed' ? (
          <View style={styles.completedCard}>
            <View style={styles.completedIconBadge}>
              <Check size={28} color="#ffffff" />
            </View>
            <Text style={styles.completedTitle}>Cargo Rescue Succeeded</Text>
            <Text style={styles.completedSub}>
              AMR-02 has assumed mission execution and is en route to Rack A.
            </Text>

            <View style={styles.receiptBox}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Original Mission</Text>
                <Text style={styles.receiptVal}>JOB-2026-0812</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Rescued Container</Text>
                <Text style={styles.receiptHighlight}>BOX-101 (45 units)</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Active Carrier</Text>
                <Text style={styles.receiptSuccess}>AMR-02 (Healthy)</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Target Destination</Text>
                <Text style={styles.receiptVal}>Rack A · Level 2 · Bin 03</Text>
              </View>
              <View style={[styles.receiptRow, styles.receiptBorderTop]}>
                <Text style={styles.receiptLabel}>Faulted Unit</Text>
                <Text style={styles.receiptDanger}>AMR-01 (Flagged for Towing)</Text>
              </View>
            </View>

            <Button
              label="Done & Return to Console"
              onPress={goBack}
              variant="primary"
              size="lg"
              style={{ width: '100%', marginTop: 16 }}
            />
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {/* Critical Alert Banner */}
            <View style={styles.alertCard}>
              <View style={styles.alertIconBox}>
                <LifeBuoy size={22} color="#ffffff" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.alertBadgeRow}>
                  <View style={styles.alertBadge}>
                    <Text style={styles.alertBadgeText}>SEV-1 FLEET INCIDENT</Text>
                  </View>
                  <Text style={styles.alertRobotText}>AMR-01 FAULTED</Text>
                </View>
                <Text style={styles.alertTitle}>Payload Recovery Protocol Required</Text>
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
                  Transfer & Scan
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
                <Text style={styles.diagLabelFaulted}>Faulted Robot</Text>
                <Text style={styles.diagRobotId}>AMR-01</Text>
                <Text style={styles.diagDetail}>Error: Drive Motor Stall</Text>
                <View style={styles.diagPillFaulted}>
                  <Text style={styles.diagPillTextFaulted}>Pos: (12.4m, 8.2m)</Text>
                </View>
              </View>

              <View style={styles.diagRescue}>
                <Text style={styles.diagLabelRescue}>Rescue Robot</Text>
                <Text style={styles.diagRobotId}>AMR-02</Text>
                <Text style={styles.diagDetail}>Battery: 92% · Flatbed Empty</Text>
                <View style={styles.diagPillRescue}>
                  <Text style={styles.diagPillTextRescue}>Status: Available</Text>
                </View>
              </View>
            </View>

            {/* Stranded Cargo Info */}
            <View style={styles.cargoCard}>
              <Text style={styles.cargoTitle}>STRANDED CARGO ONBOARD:</Text>
              <View style={styles.cargoRow}>
                <View style={styles.cargoLeft}>
                  <Box size={16} color={colors.primary} />
                  <View>
                    <Text style={styles.cargoCode}>BOX-101</Text>
                    <Text style={styles.cargoDesc}>Electronic Components (45 units)</Text>
                  </View>
                </View>
                <View style={styles.cargoRight}>
                  <Text style={styles.cargoDestLabel}>Final Destination:</Text>
                  <Text style={styles.cargoDestVal}>Rack A · Level 2 · Bin 03</Text>
                </View>
              </View>
            </View>

            {/* Phase Actions */}
            {phase === 'briefing' && (
              <View style={styles.actionCardPhase1}>
                <Text style={styles.actionTitlePhase1}>Phase 1: Dispatch Rendezvous</Text>
                <Text style={styles.actionDescPhase1}>
                  Command AMR-02 to navigate autonomously to coordinate (X: 12.4m, Y: 8.2m). AMR-02 will park exactly 1.0 meter away from AMR-01 for safe cargo transfer.
                </Text>
                <Pressable
                  onPress={handleDispatchRescue}
                  style={styles.dispatchRescueBtn}
                  accessibilityRole="button"
                >
                  <Navigation size={16} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.dispatchRescueBtnText}>
                    Dispatch Rescue AMR-02 to Scene
                  </Text>
                </Pressable>
              </View>
            )}

            {phase === 'rendezvous' && (
              <View style={styles.actionCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <RefreshCw size={16} color={colors.primary} />
                  <Text style={styles.actionTitle}>AMR-02 En Route to Scene</Text>
                </View>
                <Text style={styles.actionDesc}>
                  Navigating transit corridor. ETA 15 seconds. Please set up perimeter safety cones.
                </Text>
              </View>
            )}

            {phase === 'transfer' && (
              <View style={styles.actionCard}>
                <Text style={styles.actionTitle}>Step 2: Transfer Stranded Tote & Scan Barcode</Text>
                <Text style={styles.actionDesc}>
                  Physically move container BOX-101 from AMR-01 Tray 1 to AMR-02 Tray 1, then scan barcode to verify.
                </Text>

                {scannedBarcode ? (
                  <View style={styles.verifiedBox}>
                    <CheckCircle2 size={18} color={colors.success} />
                    <Text style={styles.verifiedText}>Barcode Verified: {scannedBarcode}</Text>
                  </View>
                ) : (
                  <Button
                    label="SIMULATE SCAN BARCODE (BOX-101)"
                    icon={<ScanLine size={16} color={colors.primary} />}
                    onPress={handleScanStrandedTote}
                    variant="outline"
                    size="md"
                    style={{ marginTop: 8 }}
                  />
                )}

                <Button
                  label="CONFIRM TRANSFER & RESUME MISSION"
                  icon={<Check size={16} color="#ffffff" />}
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
                <Text style={styles.actionTitle}>Re-assigning Mission to AMR-02...</Text>
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
    paddingBottom: 40,
  },
  feedbackToast: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  feedbackText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  alertCard: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    ...shadows.panel,
  },
  alertIconBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertBadge: {
    backgroundColor: colors.danger,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  alertBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#ffffff',
    fontFamily: typography.fontMono,
  },
  alertRobotText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.danger,
    fontFamily: typography.fontMono,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.danger,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  alertDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 14,
    marginTop: 2,
  },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    ...shadows.panel,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 92, 209, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumActive: {
    backgroundColor: 'rgba(0, 92, 209, 0.2)',
  },
  stepNumText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    fontFamily: typography.fontMono,
  },
  stepNumTextActive: {
    color: colors.primary,
  },
  stepText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  stepTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  stepArrow: {
    fontSize: 12,
    color: colors.textMuted,
  },
  diagRow: {
    flexDirection: 'row',
    gap: 10,
  },
  diagFaulted: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 12,
    ...shadows.panel,
  },
  diagLabelFaulted: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    color: colors.danger,
    letterSpacing: 0.8,
  },
  diagRescue: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    padding: 12,
    ...shadows.panel,
  },
  diagLabelRescue: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    color: colors.success,
    letterSpacing: 0.8,
  },
  diagRobotId: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
    marginTop: 4,
  },
  diagDetail: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  diagPillFaulted: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  diagPillTextFaulted: {
    fontSize: 10,
    fontFamily: typography.fontMono,
    color: colors.danger,
  },
  diagPillRescue: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  diagPillTextRescue: {
    fontSize: 10,
    fontFamily: typography.fontMono,
    color: colors.success,
  },
  cargoCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
    ...shadows.panel,
  },
  cargoTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  cargoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cargoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cargoCode: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  cargoDesc: {
    fontSize: 11,
    color: colors.textMuted,
  },
  cargoRight: {
    alignItems: 'flex-end',
  },
  cargoDestLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cargoDestVal: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: typography.fontMono,
  },
  actionCardPhase1: {
    backgroundColor: 'rgba(0, 92, 209, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 92, 209, 0.2)',
    padding: 16,
    gap: 12,
    ...shadows.panel,
  },
  actionTitlePhase1: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionDescPhase1: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },
  dispatchRescueBtn: {
    backgroundColor: colors.primary,
    minHeight: 64,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 3,
    borderBottomColor: '#004bb0',
  },
  dispatchRescueBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  actionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
    ...shadows.panel,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  actionDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: 4,
  },
  verifiedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.successSoft,
    borderRadius: 8,
    padding: 10,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.success,
    fontFamily: typography.fontMono,
  },
  completedCard: {
    backgroundColor: colors.successBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.successBorder,
    padding: 18,
    alignItems: 'center',
    ...shadows.panel,
  },
  completedIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.control,
  },
  completedTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 12,
    fontFamily: typography.fontSans,
  },
  completedSub: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  receiptBox: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  receiptLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  receiptVal: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  receiptHighlight: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  receiptSuccess: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.success,
    fontFamily: typography.fontMono,
  },
  receiptDanger: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.danger,
    fontFamily: typography.fontMono,
  },
  receiptBorderTop: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 4,
  },
});

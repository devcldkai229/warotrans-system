import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { colors } from '../../shared/theme/colors';

type RescuePhase = 'briefing' | 'rendezvous' | 'transfer' | 'resuming' | 'completed';

export function PayloadRecoveryScreen() {
  const { goBack } = useNavigation();
  const [phase, setPhase] = useState<RescuePhase>('briefing');
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleDispatchRescue = () => {
    setPhase('rendezvous');
    setFeedback('AMR-02 dispatched to rendezvous coordinates (X: 12.4m, Y: 8.2m).');
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
    }, 1500);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Toast Feedback */}
      {feedback && (
        <View style={styles.feedbackToast}>
          <Text style={styles.feedbackText}>{feedback}</Text>
        </View>
      )}

      {phase === 'completed' ? (
        <View style={styles.completedCard}>
          <View style={styles.completedIconBadge}>
            <Text style={styles.completedIcon}>✓</Text>
          </View>
          <Text style={styles.completedTitle}>Cargo Rescue Succeeded!</Text>
          <Text style={styles.completedSub}>
            AMR-02 has assumed mission execution and is en route to Rack A.
          </Text>

          <View style={styles.receiptBox}>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Original Mission:</Text>
              <Text style={styles.receiptVal}>JOB-2026-0881</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Rescued Container:</Text>
              <Text style={styles.receiptHighlight}>BOX-101 (45 units)</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Active Carrier:</Text>
              <Text style={styles.receiptSuccess}>AMR-02 (Healthy)</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Destination:</Text>
              <Text style={styles.receiptVal}>Rack A · Level 2 · Bin 03</Text>
            </View>
            <View style={[styles.receiptRow, styles.receiptBorderTop]}>
              <Text style={styles.receiptLabel}>Faulted Unit:</Text>
              <Text style={styles.receiptDanger}>AMR-01 (Flagged for Towing)</Text>
            </View>
          </View>

          <Button
            label="Done & Return to Console"
            onPress={goBack}
            variant="primary"
            size="lg"
            style={{ width: '100%' }}
          />
        </View>
      ) : (
        <View>
          {/* Critical Incident Banner */}
          <View style={styles.alertCard}>
            <View style={styles.alertTopRow}>
              <View style={styles.alertBadge}>
                <Text style={styles.alertBadgeText}>SEV-1 FLEET INCIDENT</Text>
              </View>
              <Text style={styles.alertRobotText}>AMR-01 FAULTED</Text>
            </View>
            <Text style={styles.alertTitle}>Emergency Payload Recovery Protocol</Text>
            <Text style={styles.alertDesc}>
              AMR-01 suffered motor stall with live cargo BOX-101. Deploy AMR-02 to transfer payload and resume mission.
            </Text>
          </View>

          {/* Stepper Progress */}
          <View style={styles.stepperBox}>
            <View style={styles.stepCol}>
              <Text
                style={[
                  styles.stepText,
                  (phase === 'briefing' || phase === 'rendezvous') && styles.stepTextActive,
                ]}
              >
                1. Rendezvous
              </Text>
            </View>
            <Text style={styles.stepArrow}>➔</Text>
            <View style={styles.stepCol}>
              <Text
                style={[
                  styles.stepText,
                  phase === 'transfer' && styles.stepTextActive,
                ]}
              >
                2. Transfer & Scan
              </Text>
            </View>
            <Text style={styles.stepArrow}>➔</Text>
            <View style={styles.stepCol}>
              <Text
                style={[
                  styles.stepText,
                  phase === 'resuming' && styles.stepTextActive,
                ]}
              >
                3. Resume
              </Text>
            </View>
          </View>

          {/* Phase 1: Briefing & Dispatch Rescue */}
          {phase === 'briefing' && (
            <View style={styles.actionCard}>
              <Text style={styles.actionTitle}>Step 1: Dispatch Carrier AMR-02</Text>
              <Text style={styles.actionDesc}>
                Available carrier AMR-02 is ready at Depot. Press below to route AMR-02 to stalled AMR-01 coordinates.
              </Text>
              <Button
                label="DISPATCH RESCUE AMR-02 NOW"
                onPress={handleDispatchRescue}
                variant="danger"
                size="lg"
              />
            </View>
          )}

          {phase === 'rendezvous' && (
            <View style={styles.actionCard}>
              <Text style={styles.actionTitle}>AMR-02 En Route to Stalled Unit</Text>
              <Text style={styles.actionDesc}>
                Navigating transit corridor. ETA 15 seconds. Please prepare safety cones.
              </Text>
            </View>
          )}

          {/* Phase 2: Physical Transfer & Barcode Scan */}
          {phase === 'transfer' && (
            <View style={styles.actionCard}>
              <Text style={styles.actionTitle}>Step 2: Transfer Stranded Tote</Text>
              <Text style={styles.actionDesc}>
                Move container BOX-101 from AMR-01 slot 1 to AMR-02 flatbed slot 1, then scan barcode to verify.
              </Text>

              <View style={styles.transferBox}>
                <Text style={styles.transferToteLabel}>Stranded Container:</Text>
                <Text style={styles.transferToteVal}>BOX-101 (Optical Sensors X4)</Text>
              </View>

              {scannedBarcode ? (
                <View style={styles.verifiedBox}>
                  <Text style={styles.verifiedText}>✓ Barcode Verified: {scannedBarcode}</Text>
                </View>
              ) : (
                <Pressable
                  onPress={handleScanStrandedTote}
                  style={styles.scanBtn}
                >
                  <Text style={styles.scanBtnText}>📷 Simulate Scan Barcode (BOX-101)</Text>
                </Pressable>
              )}

              <View style={{ height: 12 }} />
              <Button
                label="CONFIRM TRANSFER & RESUME MISSION"
                onPress={handleResumeMission}
                disabled={!scannedBarcode}
                variant="primary"
                size="lg"
              />
            </View>
          )}

          {phase === 'resuming' && (
            <View style={styles.actionCard}>
              <Text style={styles.actionTitle}>Re-assigning Mission to AMR-02...</Text>
              <Text style={styles.actionDesc}>
                Updating central FMS dispatch records and Nav2 dropoff route.
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
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
    color: colors.primaryDark,
  },
  alertCard: {
    backgroundColor: colors.dangerBg,
    borderWidth: 1.5,
    borderColor: colors.dangerBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  alertTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  alertBadge: {
    backgroundColor: colors.danger,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  alertBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.textInverse,
  },
  alertRobotText: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '900',
    color: colors.danger,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.danger,
    marginBottom: 4,
  },
  alertDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  stepCol: {
    alignItems: 'center',
  },
  stepText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  stepTextActive: {
    color: colors.primary,
    fontWeight: '900',
  },
  stepArrow: {
    fontSize: 12,
    color: colors.textMuted,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  actionDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: 14,
  },
  transferBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  transferToteLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
  },
  transferToteVal: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.primary,
    marginTop: 2,
  },
  scanBtn: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  verifiedBox: {
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.success,
  },
  completedCard: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.successBorder,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  completedIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  completedIcon: {
    fontSize: 24,
    color: colors.textInverse,
    fontWeight: '900',
  },
  completedTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  completedSub: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  receiptBox: {
    width: '100%',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 10,
    padding: 12,
    gap: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  receiptVal: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  receiptHighlight: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.primary,
  },
  receiptSuccess: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.success,
  },
  receiptBorderTop: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
    marginTop: 4,
  },
  receiptDanger: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.danger,
  },
});

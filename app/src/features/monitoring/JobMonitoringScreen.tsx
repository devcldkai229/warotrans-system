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
import { BarcodeScannerHUD } from './BarcodeScannerHUD';
import { IncidentCategory, IssueReportingModal } from './IssueReportingModal';

export function JobMonitoringScreen() {
  const { navigate, goBack, params } = useNavigation();

  // State
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isRobotHeld, setIsRobotHeld] = useState(false);
  const [isContainerVerified, setIsContainerVerified] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [isScanMismatch, setIsScanMismatch] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [isHandoverCompleted, setIsHandoverCompleted] = useState(false);

  const jobId = params?.jobId || 'JOB-2026-0881';
  const targetBarcode = 'BOX-101';

  const handleScanResult = (scanned: string) => {
    setIsScannerOpen(false);
    setScannedBarcode(scanned);

    if (scanned === targetBarcode) {
      setIsContainerVerified(true);
      setIsScanMismatch(false);
      setFeedbackToast(`Barcode matched: ${scanned} verified.`);
    } else {
      setIsContainerVerified(false);
      setIsScanMismatch(true);
      setFeedbackToast(`Mismatch! Expected ${targetBarcode}, got ${scanned}.`);
    }

    setTimeout(() => setFeedbackToast(null), 4000);
  };

  const handleToggleHold = () => {
    if (isRobotHeld) {
      setIsRobotHeld(false);
      setFeedbackToast('AMR-01 soft-pause released. Normal operations resumed.');
    } else {
      setIsRobotHeld(true);
      setFeedbackToast('HOLD ACTIVE: AMR-01 motion locked within 3m perimeter.');
    }
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  const handleIssueSubmit = (cat: IncidentCategory, notes: string) => {
    setIsRobotHeld(true);
    setFeedbackToast(`Safety Incident logged: ${cat}. Supervisor notified.`);
    setTimeout(() => setFeedbackToast(null), 4000);
  };

  const handleConfirmHandover = () => {
    setIsHandoverCompleted(true);
  };

  // Completion Success State
  if (isHandoverCompleted) {
    return (
      <View style={styles.completedContainer}>
        <View style={styles.completedCard}>
          <View style={styles.completedIconWrap}>
            <Text style={styles.completedIcon}>✓</Text>
          </View>
          <Text style={styles.completedTitle}>Handover Completed!</Text>
          <Text style={styles.completedSubtitle}>
            BOX-101 physically stored at Rack A-02 Bin 03. AMR-01 released to fleet pool.
          </Text>

          <View style={styles.receiptSummary}>
            <Text style={styles.receiptLabel}>Job Reference: {jobId}</Text>
            <Text style={styles.receiptTime}>Cleared At: {new Date().toLocaleTimeString()}</Text>
          </View>

          <Button
            label="Return to Dashboard"
            onPress={() => navigate('home')}
            variant="primary"
            size="lg"
            style={{ width: '100%' }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Status Toast Notification */}
        {feedbackToast && (
          <View
            style={[
              styles.toastBox,
              isScanMismatch ? styles.toastDanger : styles.toastNormal,
            ]}
          >
            <Text
              style={[
                styles.toastText,
                isScanMismatch ? styles.toastDangerText : styles.toastNormalText,
              ]}
            >
              {feedbackToast}
            </Text>
          </View>
        )}

        {/* Live Handover Station Hero Header (SCR-STF-09) */}
        <View style={styles.stationCard}>
          <View style={styles.stationTopRow}>
            <View style={styles.atStationPill}>
              <View style={styles.stationDot} />
              <Text style={styles.atStationText}>AT HANDOVER STATION</Text>
            </View>
            <View style={styles.timerPill}>
              <Text style={styles.timerText}>⏱ 04:45 REMAINING</Text>
            </View>
          </View>

          <Text style={styles.stationHeading}>AMR-01 Docked at Rack A-02</Text>
          <Text style={styles.stationSub}>
            AMR has engaged mechanical brakes. Waiting for operator physical handover & barcode verification.
          </Text>

          <View style={styles.safetyStatusRow}>
            <View style={styles.safetyPulseRow}>
              <View style={styles.safetyPingDot} />
              <Text style={styles.safetyText}>Safety Perimeter Active (3m)</Text>
            </View>
            <Text style={styles.batteryText}>Battery: 78%</Text>
          </View>
        </View>

        {/* Safety Controls Bar */}
        <View style={styles.safetyControlsBar}>
          {/* Soft Hold Toggle */}
          <Pressable
            onPress={handleToggleHold}
            style={[
              styles.safetyHoldBtn,
              isRobotHeld && styles.safetyHoldBtnActive,
            ]}
          >
            <Text style={styles.safetyHoldIcon}>🛑</Text>
            <Text
              style={[
                styles.safetyHoldText,
                isRobotHeld && styles.safetyHoldTextActive,
              ]}
            >
              {isRobotHeld ? 'RESUME ROBOT (RELEASE)' : 'HOLD ROBOT (SOFT PAUSE)'}
            </Text>
          </Pressable>

          {/* Issue Reporting Button */}
          <Pressable
            onPress={() => setIsIssueModalOpen(true)}
            style={styles.safetyIssueBtn}
          >
            <Text style={styles.safetyIssueIcon}>⚠️</Text>
            <Text style={styles.safetyIssueText}>Report Issue</Text>
          </Pressable>
        </View>

        {/* Barcode Verification Container Card */}
        <View style={styles.verificationSection}>
          <View style={styles.verHeaderRow}>
            <Text style={styles.verSectionTitle}>CONTAINER HANDOVER VERIFICATION</Text>
            <Text style={styles.verTargetLabel}>Target: {targetBarcode}</Text>
          </View>

          <View
            style={[
              styles.targetContainerCard,
              isContainerVerified && styles.targetCardVerified,
              isScanMismatch && styles.targetCardMismatch,
            ]}
          >
            <View style={styles.targetCardTop}>
              <View style={styles.targetActionBadge}>
                <Text style={styles.targetActionText}>UNLOAD PAYLOAD</Text>
              </View>
              <Text
                style={[
                  styles.verStatusText,
                  isContainerVerified && styles.verStatusVerified,
                  isScanMismatch && styles.verStatusMismatch,
                ]}
              >
                {isContainerVerified
                  ? '✓ VERIFIED MATCH'
                  : isScanMismatch
                  ? '⚠️ MISMATCH DETECTED'
                  : 'PENDING SCAN'}
              </Text>
            </View>

            <View style={styles.targetCardBody}>
              <Text style={styles.targetBarcodeText}>{targetBarcode}</Text>
              <Text style={styles.targetProductText}>Optical Proximity Sensor X4 (45 pcs)</Text>
              <Text style={styles.targetSlotLocation}>Slot 1 (Front Deck) ➔ Rack A · Level 2 · Bin 03</Text>
            </View>

            {scannedBarcode && (
              <View style={styles.scannedResultBox}>
                <Text style={styles.scannedResultLabel}>Scanned Barcode: </Text>
                <Text style={styles.scannedResultValue}>{scannedBarcode}</Text>
              </View>
            )}

            {/* Launch Camera Scanner HUD */}
            <Pressable
              onPress={() => setIsScannerOpen(true)}
              style={({ pressed }) => [
                styles.launchScannerBtn,
                pressed && styles.launchScannerBtnPressed,
              ]}
            >
              <Text style={styles.scannerBtnIcon}>📷</Text>
              <Text style={styles.scannerBtnText}>
                {isContainerVerified ? 'Re-scan Barcode' : 'Open Camera Barcode Scanner'}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Primary Action Button (Bottom Fixed) */}
      <View style={styles.bottomBar}>
        <Button
          label="CONFIRM HANDOVER & RELEASE AMR"
          onPress={handleConfirmHandover}
          disabled={!isContainerVerified}
          size="lg"
          variant="primary"
        />
        {!isContainerVerified && (
          <Text style={styles.disabledHintText}>
            Verify barcode ({targetBarcode}) to unlock robot release
          </Text>
        )}
      </View>

      {/* Barcode Scanner Viewfinder Modal */}
      <BarcodeScannerHUD
        visible={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanResult={handleScanResult}
        targetBarcode={targetBarcode}
      />

      {/* Issue Reporting Modal */}
      <IssueReportingModal
        visible={isIssueModalOpen}
        onClose={() => setIsIssueModalOpen(false)}
        onSubmit={handleIssueSubmit}
        robotCode="AMR-01"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  toastBox: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
  },
  toastNormal: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryBorder,
  },
  toastNormalText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '700',
  },
  toastDanger: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
  toastDangerText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '700',
  },
  toastText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stationCard: {
    backgroundColor: colors.warningBg,
    borderWidth: 1.5,
    borderColor: colors.warning,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  stationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  atStationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 6,
  },
  stationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  atStationText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  timerPill: {
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  timerText: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.warning,
  },
  stationHeading: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  stationSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  safetyStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
  },
  safetyPulseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  safetyPingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  safetyText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  batteryText: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: colors.textSecondary,
  },
  safetyControlsBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  safetyHoldBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  safetyHoldBtnActive: {
    backgroundColor: colors.danger,
  },
  safetyHoldIcon: {
    fontSize: 14,
  },
  safetyHoldText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.danger,
  },
  safetyHoldTextActive: {
    color: colors.textInverse,
  },
  safetyIssueBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  safetyIssueIcon: {
    fontSize: 14,
  },
  safetyIssueText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  verificationSection: {
    marginBottom: 12,
  },
  verHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  verSectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textSecondary,
  },
  verTargetLabel: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.primary,
  },
  targetContainerCard: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
  },
  targetCardVerified: {
    borderColor: colors.success,
    backgroundColor: colors.successBg,
  },
  targetCardMismatch: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  targetCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  targetActionBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  targetActionText: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.textInverse,
  },
  verStatusText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.textMuted,
  },
  verStatusVerified: {
    color: colors.success,
  },
  verStatusMismatch: {
    color: colors.danger,
  },
  targetCardBody: {
    marginBottom: 10,
  },
  targetBarcodeText: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  targetProductText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 2,
  },
  targetSlotLocation: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  scannedResultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scannedResultLabel: {
    fontSize: 10,
    color: colors.textMuted,
  },
  scannedResultValue: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '800',
    color: colors.textPrimary,
  },
  launchScannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    gap: 8,
  },
  launchScannerBtnPressed: {
    backgroundColor: colors.primaryDark,
  },
  scannerBtnIcon: {
    fontSize: 16,
  },
  scannerBtnText: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '800',
  },
  bottomBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 12,
  },
  disabledHintText: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
  },
  completedContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  completedCard: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.successBorder,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
  },
  completedIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  completedIcon: {
    fontSize: 28,
    color: colors.textInverse,
    fontWeight: '900',
  },
  completedTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  completedSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 17,
    marginBottom: 16,
  },
  receiptSummary: {
    width: '100%',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    gap: 4,
  },
  receiptLabel: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: colors.textPrimary,
  },
  receiptTime: {
    fontSize: 10,
    color: colors.textMuted,
  },
});

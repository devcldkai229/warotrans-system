import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Maximize2,
  Shield,
  Timer,
} from 'lucide-react-native';
import { Button } from '../../shared/components/Button';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { BarcodeScannerHUD } from './BarcodeScannerHUD';
import { IncidentCategory, IssueReportingModal } from './IssueReportingModal';
import { triggerHaptic } from '../../shared/utils/haptics';

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
      triggerHaptic('success');
      setIsContainerVerified(true);
      setIsScanMismatch(false);
      setFeedbackToast(`Barcode matched: ${scanned} verified.`);
    } else {
      triggerHaptic('error');
      setIsContainerVerified(false);
      setIsScanMismatch(true);
      setFeedbackToast(`Mismatch! Expected ${targetBarcode}, got ${scanned}.`);
    }

    setTimeout(() => setFeedbackToast(null), 4000);
  };

  const handleToggleHold = () => {
    triggerHaptic('tap');
    if (isRobotHeld) {
      setIsRobotHeld(false);
      setFeedbackToast('AMR-01 soft-pause released. Normal operations resumed.');
    } else {
      setIsRobotHeld(true);
      setFeedbackToast('Hold active: AMR-01 motion locked within 3m perimeter.');
    }
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  const handleIssueSubmit = (cat: IncidentCategory, notes: string) => {
    triggerHaptic('warning');
    setIsRobotHeld(true);
    setFeedbackToast(`Safety incident logged: ${cat}. Supervisor notified.`);
    setTimeout(() => setFeedbackToast(null), 4000);
  };

  const handleConfirmHandover = () => {
    triggerHaptic('success');
    setIsHandoverCompleted(true);
  };

  // Completion Success State
  if (isHandoverCompleted) {
    return (
      <View style={styles.completedContainer}>
        <View style={styles.completedCard}>
          <View style={styles.completedIconWrap}>
            <CheckCircle2 size={36} color="#16a34a" />
          </View>
          <Text style={styles.completedTitle}>Handover completed</Text>
          <Text style={styles.completedSubtitle}>
            BOX-101 physically stored at Rack A-02 Bin 03. AMR-01 released to fleet pool.
          </Text>

          <View style={styles.receiptSummary}>
            <Text style={styles.receiptLabel}>Job reference: {jobId}</Text>
            <Text style={styles.receiptTime}>Cleared at: {new Date().toLocaleTimeString()}</Text>
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
      <SubScreenHeader
        label="Handover console"
        title="Live Robot Telemetry"
        onBack={goBack}
        rightAction={
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              navigate('live_map', { jobId });
            }}
            style={styles.liveMapHeaderBtn}
          >
            <Maximize2 size={16} color={colors.textPrimary} />
            <Text style={styles.liveMapHeaderText}>Radar map</Text>
          </Pressable>
        }
      />

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

        {/* Station Hero Header */}
        <View style={styles.stationCard}>
          <View style={styles.stationTopRow}>
            <View style={styles.atStationPill}>
              <View style={styles.stationDot} />
              <Text style={styles.atStationText}>At station</Text>
            </View>
            <View style={styles.timerPill}>
              <Timer size={13} color="#b45309" />
              <Text style={styles.timerText}>04:45 remaining</Text>
            </View>
          </View>

          <Text style={styles.stationHeading}>AMR-01 docked at Rack A-02</Text>

          <View style={styles.safetyStatusRow}>
            <View style={styles.safetyPulseRow}>
              <View style={styles.safetyPingDot} />
              <Text style={styles.safetyText}>Safety perimeter active (3m)</Text>
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
            accessibilityRole="button"
          >
            <AlertTriangle
              size={16}
              color={isRobotHeld ? '#ffffff' : colors.textPrimary}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.safetyHoldText,
                isRobotHeld && styles.safetyHoldTextActive,
              ]}
            >
              {isRobotHeld ? 'Resume robot' : 'Hold robot'}
            </Text>
          </Pressable>

          {/* Issue Reporting Button */}
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setIsIssueModalOpen(true);
            }}
            style={styles.safetyIssueBtn}
            accessibilityRole="button"
          >
            <AlertCircle size={16} color="#dc2626" style={{ marginRight: 6 }} />
            <Text style={styles.safetyIssueText}>Report issue</Text>
          </Pressable>
        </View>

        {/* Barcode Verification Container Card */}
        <View style={styles.verificationSection}>
          <View style={styles.verHeaderRow}>
            <Text style={styles.verSectionTitle}>Container handover verification</Text>
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
                <Text style={styles.targetActionText}>Unload payload</Text>
              </View>
              <View style={styles.verStatusBadgeRow}>
                {isContainerVerified ? (
                  <View style={styles.verSuccessBadge}>
                    <CheckCircle2 size={13} color="#16a34a" />
                    <Text style={styles.verSuccessText}>Verified match</Text>
                  </View>
                ) : isScanMismatch ? (
                  <View style={styles.verDangerBadge}>
                    <AlertCircle size={13} color="#dc2626" />
                    <Text style={styles.verDangerText}>Mismatch detected</Text>
                  </View>
                ) : (
                  <View style={styles.verPendingBadge}>
                    <Text style={styles.verPendingText}>Pending scan</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.targetCardBody}>
              <Text style={styles.targetBarcodeText}>{targetBarcode}</Text>
              <Text style={styles.targetProductText}>
                Optical Proximity Sensor X4 (<Text style={styles.boldHighlight}>45 pcs</Text>)
              </Text>
              <Text style={styles.targetSlotLocation}>
                Slot 1 (Front Deck) ➔ <Text style={styles.boldHighlight}>Rack A · Level 2 · Bin 03</Text>
              </Text>
            </View>

            {scannedBarcode && (
              <View style={styles.scannedResultBox}>
                <Text style={styles.scannedResultLabel}>Scanned barcode: </Text>
                <Text style={styles.scannedResultValue}>{scannedBarcode}</Text>
              </View>
            )}

            {/* Launch Camera Scanner HUD */}
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                setIsScannerOpen(true);
              }}
              style={({ pressed }) => [
                styles.launchScannerBtn,
                pressed && styles.launchScannerBtnPressed,
              ]}
              accessibilityRole="button"
            >
              <Camera size={16} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.scannerBtnText}>
                {isContainerVerified ? 'Re-scan barcode' : 'Scan barcode'}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Primary Action Button (Bottom Fixed) */}
      <View style={styles.bottomBar}>
        <Button
          label="Confirm Handover"
          onPress={handleConfirmHandover}
          disabled={!isContainerVerified}
          size="lg"
          variant="primary"
        />
        {!isContainerVerified && (
          <Text style={styles.disabledHintText}>
            Scan {targetBarcode} to unlock release
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
    paddingBottom: 32,
  },
  liveMapHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  liveMapHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  toastBox: {
    padding: 12,
    borderRadius: radii.md,
    marginBottom: 12,
    borderWidth: 1,
  },
  toastNormal: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
  },
  toastNormalText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: typography.fontSans,
  },
  toastDanger: {
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderColor: 'rgba(220, 38, 38, 0.25)',
  },
  toastDangerText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: typography.fontSans,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: typography.fontSans,
  },
  stationCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 14,
    ...shadows.panel,
  },
  stationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  atStationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 6,
  },
  stationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#b45309',
  },
  atStationText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
    fontFamily: typography.fontSans,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timerText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: typography.fontMono,
    color: '#b45309',
  },
  stationHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  safetyStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.sm,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: '#16a34a',
  },
  safetyText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  batteryText: {
    fontSize: 12,
    fontFamily: typography.fontMono,
    fontWeight: '600',
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
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    minHeight: 44,
  },
  safetyHoldBtnActive: {
    backgroundColor: colors.darkAction,
    borderColor: colors.darkAction,
  },
  safetyHoldText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  safetyHoldTextActive: {
    color: '#ffffff',
  },
  safetyIssueBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    minHeight: 44,
  },
  safetyIssueText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  verificationSection: {
    marginBottom: 14,
  },
  verHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  verSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  verTargetLabel: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: typography.fontMono,
    color: colors.textSecondary,
  },
  targetContainerCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 16,
    ...shadows.panel,
  },
  targetCardVerified: {
    borderColor: '#16a34a',
  },
  targetCardMismatch: {
    borderColor: '#dc2626',
  },
  targetCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  targetActionBadge: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  targetActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  verStatusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verSuccessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verSuccessText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a',
    fontFamily: typography.fontSans,
  },
  verDangerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verDangerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
    fontFamily: typography.fontSans,
  },
  verPendingBadge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verPendingText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  targetCardBody: {
    marginBottom: 12,
  },
  targetBarcodeText: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: typography.fontMono,
    color: colors.textPrimary,
  },
  targetProductText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 4,
    fontFamily: typography.fontSans,
  },
  targetSlotLocation: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
    fontFamily: typography.fontSans,
  },
  boldHighlight: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  scannedResultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    padding: 10,
    borderRadius: radii.sm,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scannedResultLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  scannedResultValue: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: typography.fontMono,
    color: colors.textPrimary,
  },
  launchScannerBtn: {
    backgroundColor: colors.darkAction,
    borderRadius: radii.md,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  launchScannerBtnPressed: {
    backgroundColor: colors.darkActionPressed,
  },
  scannerBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: typography.fontSans,
  },
  bottomBar: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  disabledHintText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  completedContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  completedCard: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    ...shadows.float,
  },
  completedIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  completedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  completedSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 16,
    fontFamily: typography.fontSans,
  },
  receiptSummary: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    width: '100%',
    marginBottom: 20,
    gap: 4,
  },
  receiptLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  receiptTime: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
});

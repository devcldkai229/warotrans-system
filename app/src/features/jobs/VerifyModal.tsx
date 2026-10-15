import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Camera,
  Check,
  PackageCheck,
  RefreshCw,
  Timer,
  X,
  ScanLine,
} from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { Button, Card, Text, TextField } from '../../shared/ui';
import { toast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import { confirmHandover } from '../../shared/api';
import { BarcodeScannerHUD } from '../monitoring/BarcodeScannerHUD';

interface OtherContainerInfo {
  code: string;
  slot: string;
}

interface VerifyModalProps {
  visible: boolean;
  targetContainer?: string;
  targetContainerId?: string;
  jobStepId?: string;
  operatorId?: string;
  robotCode?: string;
  location?: string;
  targetShelf?: string;
  productName?: string;
  quantity?: number;
  initialMismatch?: boolean;
  initialBarcodeInput?: string;
  otherContainers?: OtherContainerInfo[];
  isBulkMode?: boolean;
  onClose: () => void;
  onSuccess: (code: string) => void;
  onReportIssue: () => void;
}

export function VerifyModal({
  visible,
  targetContainer = 'BOX-101',
  targetContainerId,
  jobStepId,
  operatorId,
  robotCode = 'AMR-01',
  location = 'Stop 2/3: Rack A-02',
  targetShelf = 'Rack A · Level 2 · Bin 03',
  productName = 'Electronic Components',
  quantity = 12,
  initialMismatch = false,
  initialBarcodeInput = '',
  otherContainers = [
    { code: 'BOX-102', slot: 'Slot 2 (Mid)' },
    { code: 'BOX-103', slot: 'Slot 3 (Rear)' },
  ],
  isBulkMode = false,
  onClose,
  onSuccess,
  onReportIssue,
}: VerifyModalProps) {
  const [timeLeft, setTimeLeft] = useState(300); // 300s standard timeout
  const [barcodeInput, setBarcodeInput] = useState(initialBarcodeInput || (initialMismatch ? 'BOX-999' : ''));
  const [mismatch, setMismatch] = useState(initialMismatch);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTimeLeft(300);
    setBarcodeInput(initialBarcodeInput || (initialMismatch ? 'BOX-999' : ''));
    setMismatch(initialMismatch);
    setIsSubmitting(false);
  }, [visible, initialMismatch, initialBarcodeInput]);

  useEffect(() => {
    if (!visible || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [visible, timeLeft]);

  const mins = Math.floor(timeLeft / 60);
  const secs = (timeLeft % 60).toString().padStart(2, '0');
  const isUrgent = timeLeft < 30;

  const handleVerify = async (codeToVerify?: string) => {
    const code = (codeToVerify ?? barcodeInput).trim();
    if (!code || isSubmitting) return;

    if (code.toUpperCase() === targetContainer.toUpperCase()) {
      setIsSubmitting(true);
      try {
        await confirmHandover(jobStepId || 'step-handover-01', {
          containerId: targetContainerId || code,
          confirmedBy: operatorId || 'staff-01',
          handoverType: 'DROPOFF',
          note: `Handover confirmed for ${code} on ${robotCode}`,
        });
        triggerHaptic('success');
        setMismatch(false);
        toast.success(`Payload ${code} verified. Handover completed.`);
        onSuccess(code);
      } catch (err: any) {
        toast.error(err?.message || 'Handover confirmation failed');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      triggerHaptic('error');
      setMismatch(true);
      toast.error(`Barcode mismatch: scanned ${code}, expected ${targetContainer}.`);
    }
  };

  const handleScannerResult = (scanned: string) => {
    triggerHaptic('tap');
    setIsScannerOpen(false);
    setBarcodeInput(scanned);
    handleVerify(scanned);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.sheetContainer}>
          {!mismatch ? (
            /* Normal Verification Flow */
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Header */}
              <View style={styles.headerRow}>
                <View style={styles.headerTitleCol}>
                  <View style={styles.eyebrowRow}>
                    <Text variant="caption" color={colors.primary} style={styles.eyebrow}>
                      {isBulkMode ? 'Batch Dock Handover' : 'Handover Verification'}
                    </Text>
                    <View style={[styles.timerBadge, isUrgent && styles.timerBadgeUrgent]}>
                      <Timer size={13} color={isUrgent ? colors.danger : colors.warning} />
                      <Text
                        variant="caption"
                        color={isUrgent ? colors.danger : colors.warning}
                        style={styles.timerText}
                      >
                        {timeLeft > 0 ? `${mins}:${secs}` : 'Expired'}
                      </Text>
                    </View>
                  </View>

                  <Text variant="title" style={styles.sheetTitle}>
                    {isBulkMode ? `Confirm Batch · ${robotCode}` : `Confirm Handover · ${robotCode}`}
                  </Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    {location}
                  </Text>
                </View>

                <Pressable
                  onPress={onClose}
                  style={styles.closeBtn}
                  accessibilityLabel="Close verification"
                >
                  <X size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              {/* Target Container Card */}
              <View style={styles.targetCard}>
                <View style={styles.targetCardHeader}>
                  <View style={styles.targetBadge}>
                    <PackageCheck size={14} color="#ffffff" style={{ marginRight: 4 }} />
                    <Text variant="caption" style={styles.targetBadgeText}>
                      Target Tote
                    </Text>
                  </View>
                  <Text variant="caption" color={colors.textSecondary} style={styles.shelfText}>
                    {targetShelf}
                  </Text>
                </View>

                <View style={styles.targetCodeRow}>
                  <Text variant="title" style={styles.targetCode}>
                    {targetContainer}
                  </Text>
                  {productName ? (
                    <Text variant="bodyMedium" color={colors.textSecondary}>
                      {quantity ? <Text style={styles.boldQty}>{quantity} × </Text> : null}{productName}
                    </Text>
                  ) : (
                    <Text variant="caption" color={colors.textSecondary}>
                      Container Barcode
                    </Text>
                  )}
                </View>
              </View>

              {/* Barcode Scan & Input Console */}
              <View style={styles.scanSection}>
                <Text variant="label" style={styles.sectionLabel}>
                  Scan or Enter Barcode
                </Text>

                <View style={styles.inputRow}>
                  <View style={styles.inputWrapper}>
                    <TextField
                      value={barcodeInput}
                      onChangeText={(val) => {
                        setBarcodeInput(val);
                        if (mismatch) setMismatch(false);
                      }}
                      placeholder={`e.g. ${targetContainer}`}
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={() => handleVerify()}
                      containerStyle={styles.inputField}
                    />
                  </View>

                  <Pressable
                    onPress={() => setIsScannerOpen(true)}
                    style={({ pressed }) => [
                      styles.cameraBtn,
                      pressed && styles.btnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Scan with Camera"
                  >
                    <Camera size={20} color="#ffffff" />
                  </Pressable>
                </View>

                {/* Quick Test Autocomplete Chip */}
                <View style={styles.quickChipRow}>
                  <Text variant="caption" color={colors.textMuted}>
                    Quick test:
                  </Text>
                  <Pressable
                    onPress={() => {
                      setBarcodeInput(targetContainer);
                      handleVerify(targetContainer);
                    }}
                    style={styles.quickChip}
                  >
                    <Text variant="caption" color={colors.primary} style={styles.quickChipText}>
                      Match {targetContainer}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setBarcodeInput('BOX-999');
                      handleVerify('BOX-999');
                    }}
                    style={styles.quickChipMismatch}
                  >
                    <Text variant="caption" color={colors.danger} style={styles.quickChipText}>
                      Test Mismatch
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Bottom Actions */}
              <View style={styles.actionRow}>
                <Button
                  title="Report Issue"
                  variant="outline"
                  onPress={onReportIssue}
                  icon={AlertTriangle}
                  size="lg"
                  style={styles.issueButton}
                />
                <Button
                  title={isSubmitting ? 'Confirming...' : 'Confirm Handover'}
                  variant="primary"
                  onPress={() => handleVerify()}
                  disabled={!barcodeInput.trim() || isSubmitting}
                  icon={Check}
                  size="lg"
                  style={styles.confirmButton}
                />
              </View>
            </ScrollView>
          ) : (
            /* Barcode Mismatch Alert Screen */
            <View style={styles.mismatchContainer}>
              <View style={styles.mismatchHeader}>
                <View style={styles.mismatchIconWell}>
                  <AlertTriangle size={24} color={colors.danger} />
                </View>
                <View style={styles.mismatchHeaderText}>
                  <Text variant="title" color={colors.danger}>
                    Barcode Mismatch Detected
                  </Text>
                  <Text variant="caption" color={colors.textSecondary} style={{ marginTop: 2 }}>
                    Scanned tote does not match expected payload for this stop.
                  </Text>
                </View>
              </View>

              {/* Comparison Box */}
              <View style={styles.comparisonGrid}>
                <View style={styles.comparisonCol}>
                  <Text variant="caption" color={colors.textMuted} style={styles.comparisonLabel}>
                    EXPECTED CONTAINER
                  </Text>
                  <Text variant="title" style={styles.comparisonExpected}>
                    {targetContainer}
                  </Text>
                  <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
                    {targetShelf}
                  </Text>
                </View>

                <View style={[styles.comparisonCol, styles.comparisonColRight]}>
                  <Text variant="caption" color={colors.danger} style={styles.comparisonLabel}>
                    SCANNED BARCODE
                  </Text>
                  <Text variant="title" color={colors.danger} style={styles.comparisonScanned}>
                    {barcodeInput || 'BOX-999'}
                  </Text>
                  <Text variant="caption" color={colors.danger} numberOfLines={1}>
                    Incorrect / Misplaced Tote
                  </Text>
                </View>
              </View>

              {/* Actions */}
              <View style={styles.mismatchActions}>
                <Button
                  title="Retry Barcode Scan"
                  variant="primary"
                  onPress={() => {
                    setMismatch(false);
                    setBarcodeInput('');
                  }}
                  icon={RefreshCw}
                  size="lg"
                  fullWidth
                />
                <Button
                  title="Report Misplaced Container"
                  variant="danger"
                  onPress={onReportIssue}
                  icon={AlertTriangle}
                  size="md"
                  fullWidth
                />
              </View>
            </View>
          )}
        </View>

        {/* Embedded Barcode Scanner HUD */}
        <BarcodeScannerHUD
          visible={isScannerOpen}
          targetBarcode={targetContainer}
          onClose={() => setIsScannerOpen(false)}
          onScanResult={handleScannerResult}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '88%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 16,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetContent: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerTitleCol: {
    flex: 1,
    gap: 4,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrow: {
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  timerBadgeUrgent: {
    backgroundColor: colors.dangerBg,
  },
  timerText: {
    fontWeight: '700',
    fontSize: 11,
  },
  sheetTitle: {
    fontWeight: '700',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
  },
  targetCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  targetCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  targetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.darkAction,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  targetBadgeText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 11,
  },
  shelfText: {
    fontWeight: '600',
  },
  targetCodeRow: {
    gap: 2,
  },
  targetCode: {
    fontWeight: '800',
    fontSize: 22,
    letterSpacing: 0.5,
    fontFamily: typography.fontMono,
  },
  boldQty: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  scanSection: {
    gap: 8,
  },
  sectionLabel: {
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputWrapper: {
    flex: 1,
  },
  inputField: {
    backgroundColor: colors.surface,
  },
  cameraBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.darkAction,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  btnPressed: {
    opacity: 0.85,
  },
  quickChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  quickChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    backgroundColor: colors.primaryLight,
  },
  quickChipMismatch: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    backgroundColor: colors.dangerBg,
  },
  quickChipText: {
    fontWeight: '600',
    fontSize: 11,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  issueButton: {
    flex: 1,
  },
  confirmButton: {
    flex: 2,
  },
  mismatchContainer: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    gap: 20,
  },
  mismatchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mismatchIconWell: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mismatchHeaderText: {
    flex: 1,
  },
  comparisonGrid: {
    flexDirection: 'row',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSubtle,
  },
  comparisonCol: {
    flex: 1,
    padding: 14,
    gap: 4,
  },
  comparisonColRight: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    backgroundColor: '#fff5f5',
  },
  comparisonLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  comparisonExpected: {
    fontWeight: '700',
    fontSize: 18,
  },
  comparisonScanned: {
    fontWeight: '700',
    fontSize: 18,
  },
  mismatchActions: {
    gap: 10,
  },
});

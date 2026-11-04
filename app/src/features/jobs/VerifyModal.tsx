import React, { useEffect, useRef, useState } from 'react';
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
import { ApiError, confirmHandover, getContainerByBarcode } from '../../shared/api';
import type { JobDetailResponse, JobStatus, JobStepResponse } from '../../shared/types/contracts';
import { BarcodeScannerHUD } from '../monitoring/BarcodeScannerHUD';
import { handoverStatus } from './handoverData';

interface OtherContainerInfo {
  code: string;
  slot: string;
}

interface VerifyModalProps {
  visible: boolean;
  targetContainer?: string;
  targetContainerId?: string;
  jobStepId?: string;
  step?: JobStepResponse;
  jobStatus?: JobStatus;
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
  onSuccess: (code: string, updatedJob?: JobDetailResponse | null) => void;
  onReportIssue: () => void;
  onRefreshJob: () => Promise<JobDetailResponse>;
}

export function VerifyModal({
  visible,
  targetContainer = '',
  targetContainerId,
  jobStepId,
  step,
  jobStatus,
  robotCode = 'Unassigned',
  location = 'Unknown Location',
  targetShelf = 'Unknown Destination',
  productName = '',
  quantity = 1,
  initialMismatch = false,
  initialBarcodeInput = '',
  otherContainers = [],
  isBulkMode = false,
  onClose,
  onSuccess,
  onReportIssue,
  onRefreshJob,
}: VerifyModalProps) {
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState(initialBarcodeInput || (initialMismatch ? 'BOX-999' : ''));
  const [mismatch, setMismatch] = useState(initialMismatch);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionVersion = useRef(0);
  const submissionPending = useRef(false);
  const status = handoverStatus(step, jobStatus);

  useEffect(() => {
    submissionVersion.current++;
    submissionPending.current = false;
    if (visible) {
      setVerificationError(null);
      setBarcodeInput(initialBarcodeInput || (initialMismatch ? 'BOX-999' : ''));
      setMismatch(initialMismatch);
      setIsSubmitting(false);
    }
    return () => { submissionVersion.current++; };
  }, [visible, jobStepId, initialMismatch, initialBarcodeInput]);

  useEffect(() => {
    if (!status.canConfirm) {
      submissionVersion.current++; submissionPending.current = false;
      setIsSubmitting(false); setIsScannerOpen(false); setMismatch(false);
    }
  }, [status.canConfirm]);

  const handleVerify = async (codeToVerify?: string) => {
    const code = (codeToVerify ?? barcodeInput).trim();
    if (!code || isSubmitting || submissionPending.current || !status.canConfirm) return;
    setVerificationError(null);

    if (code.toUpperCase() === targetContainer.toUpperCase() || code.toUpperCase() === targetContainerId?.toUpperCase()) {
      const attempt = ++submissionVersion.current;
      submissionPending.current = true;
      setIsSubmitting(true);
      try {
        if (!jobStepId || !targetContainerId) throw new Error('No waiting handover step is available. Refresh the job.');
        const targetIsUuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(targetContainerId || '');
        const resolved = targetIsUuid ? null : await getContainerByBarcode(code);
        if (attempt !== submissionVersion.current) return;
        const resolvedContainerId = targetIsUuid ? targetContainerId! : resolved?.id || targetContainerId || code;
        const res = await confirmHandover({
          jobStepId,
          scannedContainerBarcode: resolvedContainerId,
          containerId: resolvedContainerId,
          note: `Handover confirmed for ${code} on ${robotCode}`,
        });
        if (attempt !== submissionVersion.current) return;
        triggerHaptic('success');
        setMismatch(false);
        toast.success(`Payload ${code} verified. Handover completed.`);
        onSuccess(code, res && 'status' in res && res.id ? res as JobDetailResponse : null);
      } catch (err: any) {
        if (attempt !== submissionVersion.current) return;
        setVerificationError(err?.message || 'Handover confirmation failed');
        if (err instanceof ApiError && ['job_not_running', 'job_step_not_waiting'].includes(err.code || '')) {
          try { await onRefreshJob(); } catch { /* Keep the original confirmation error visible. */ }
        }
      } finally {
        if (attempt === submissionVersion.current) { submissionPending.current = false; setIsSubmitting(false); }
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
                    <View style={styles.timerBadge}>
                      <Timer size={13} color={colors.warning} />
                      <Text
                        variant="caption"
                        color={colors.warning}
                        style={styles.timerText}
                      >
                        {status.completed ? 'Completed' : 'Waiting'}
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

              <View style={[styles.handoverStatus, status.completed && styles.handoverCompleted]} accessibilityLiveRegion="polite">
                <Text variant="bodyMedium" color={status.completed ? colors.successText : colors.textPrimary}>{status.message}</Text>
                {status.canConfirm ? <Text variant="body">After loading or unloading this container, scan its barcode here or press the confirmation button on the robot.</Text> : null}
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
              {status.canConfirm && <View style={styles.scanSection}>
                {verificationError && <Text variant="body" color={colors.danger}>{verificationError}</Text>}
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

              </View>}

              {!status.canConfirm && verificationError && !status.completed ? <Text variant="body" color={colors.danger}>{verificationError}</Text> : null}

              {/* Bottom Actions */}
              {status.canConfirm ? <View style={styles.actionRow}>
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
              </View> : <Button title="Close" onPress={onClose} size="lg" fullWidth />}
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
  handoverStatus: { backgroundColor: colors.surfaceSubtle, borderRadius: radii.md, padding: 12, gap: 6 },
  handoverCompleted: { backgroundColor: colors.successBg },
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

import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
} from 'lucide-react-native';
import { Button } from '../../shared/components/Button';
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';
import { BarcodeScannerHUD } from '../monitoring/BarcodeScannerHUD';

interface OtherContainerInfo {
  code: string;
  slot: string;
}

interface VerifyModalProps {
  visible: boolean;
  targetContainer?: string;
  robotCode?: string;
  location?: string;
  productName?: string;
  quantity?: number;
  otherContainers?: OtherContainerInfo[];
  onClose: () => void;
  onSuccess: (code: string) => void;
  onReportIssue: () => void;
}

export function VerifyModal({
  visible,
  targetContainer = 'BOX-101',
  robotCode = 'AMR-01',
  location = 'Rack A-02 Bin 03',
  productName = 'Optical Proximity Sensor X4',
  quantity = 45,
  otherContainers = [
    { code: 'BOX-204', slot: 'Slot 2 (Mid)' },
    { code: 'TOTE-088', slot: 'Slot 3 (Rear)' },
  ],
  onClose,
  onSuccess,
  onReportIssue,
}: VerifyModalProps) {
  const [timeLeft, setTimeLeft] = useState(300); // 300s standard timeout
  const [barcodeInput, setBarcodeInput] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTimeLeft(300);
    setBarcodeInput('');
    setMismatch(false);
  }, [visible]);

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

  const handleVerify = (codeToVerify?: string) => {
    const code = (codeToVerify ?? barcodeInput).trim();
    if (!code) return;

    if (code.toUpperCase() === targetContainer.toUpperCase()) {
      triggerHaptic('success');
      setMismatch(false);
      onSuccess(code);
    } else {
      triggerHaptic('error');
      setMismatch(true);
    }
  };

  const handleScannerResult = (scanned: string) => {
    triggerHaptic('tap');
    setIsScannerOpen(false);
    setBarcodeInput(scanned);
    handleVerify(scanned);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.sheetContainer}>
          <View style={styles.dragHandle} />
          {!mismatch ? (
            /* ================================================================
               SCR-STF-14: HANDOVER CONFIRMATION HUD
               ================================================================ */
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Header */}
              <View style={styles.headerRow}>
                <View style={styles.headerTitleCol}>
                  <View style={styles.eyebrowRow}>
                    <Text style={styles.eyebrow}>SCR-STF-14 · HANDOVER HUD</Text>
                    <View
                      style={[
                        styles.timerBadge,
                        isUrgent && styles.timerBadgeUrgent,
                      ]}
                    >
                      <Timer size={11} color={isUrgent ? colors.danger : '#b45309'} />
                      <Text
                        style={[
                          styles.timerText,
                          isUrgent && styles.timerTextUrgent,
                        ]}
                      >
                        {timeLeft > 0 ? `${mins}:${secs} (300s)` : 'Timed Out!'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.sheetTitle}>
                    Confirm Handover Execution · {robotCode}
                  </Text>
                  <Text style={styles.sheetSubtitle}>{location}</Text>
                </View>

                <Pressable
                  onPress={onClose}
                  style={styles.closeBtn}
                  accessibilityLabel="Close verification"
                >
                  <X size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              {/* 3-Slot Physical Flatbed Tray Schematic */}
              <View style={styles.schematicCard}>
                <View style={styles.schematicHeader}>
                  <Text style={styles.schematicTitle}>
                    AMR FLATBED DECK · PHYSICAL SLOT GUIDE
                  </Text>
                  <Text style={styles.schematicBadge}>Flatbed 3-Tray</Text>
                </View>

                <View style={styles.slotsRow}>
                  {[
                    { label: 'Slot 1 (Front)', code: targetContainer, isTarget: true },
                    { label: 'Slot 2 (Mid)', code: otherContainers[0]?.code || 'EMPTY', isTarget: false },
                    { label: 'Slot 3 (Rear)', code: otherContainers[1]?.code || 'EMPTY', isTarget: false },
                  ].map((s) => (
                    <View
                      key={s.label}
                      style={[
                        styles.slotCard,
                        s.isTarget ? styles.slotCardTarget : styles.slotCardLocked,
                      ]}
                    >
                      <Text style={styles.slotLabel}>{s.label}</Text>
                      <Text
                        style={[
                          styles.slotCode,
                          s.isTarget && styles.slotCodeTarget,
                        ]}
                      >
                        {s.code}
                      </Text>
                      <View
                        style={[
                          styles.slotTag,
                          s.isTarget ? styles.slotTagTarget : styles.slotTagLocked,
                        ]}
                      >
                        <Text
                          style={[
                            styles.slotTagText,
                            s.isTarget && styles.slotTagTextTarget,
                          ]}
                        >
                          {s.isTarget ? 'TARGET' : 'LOCKED'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* Container To Unload Highlight Box */}
              <View style={styles.targetContainerCard}>
                <View style={styles.targetCardTop}>
                  <View style={styles.targetIconRow}>
                    <PackageCheck size={16} color={colors.primary} />
                    <Text style={styles.targetCardTag}>UNLOAD CONTAINER AT THIS STATION</Text>
                  </View>
                  <View style={styles.actionPill}>
                    <Text style={styles.actionPillText}>SCAN TO UNLOAD</Text>
                  </View>
                </View>

                <View style={styles.targetInfoRow}>
                  <Text style={styles.targetCodeText}>{targetContainer}</Text>
                  <Text style={styles.targetQtyText}>
                    {quantity} × {productName}
                  </Text>
                </View>

                <View style={styles.targetDestBox}>
                  <Text style={styles.targetDestLabel}>Target Shelf Destination</Text>
                  <Text style={styles.targetDestValue}>{location}</Text>
                </View>
              </View>

              {/* Keep Onboard Warning */}
              {otherContainers.length > 0 && (
                <View style={styles.keepOnboardCard}>
                  <View style={styles.keepOnboardHeader}>
                    <Text style={styles.keepOnboardTitle}>
                      🔒 KEEP ONBOARD (DO NOT UNLOAD):
                    </Text>
                    <Text style={styles.keepOnboardCount}>
                      {otherContainers.length} Totes for next stops
                    </Text>
                  </View>
                  {otherContainers.map((c) => (
                    <View key={c.code} style={styles.keepOnboardItem}>
                      <Text style={styles.keepOnboardCode}>• {c.code} ({c.slot})</Text>
                      <Text style={styles.keepOnboardNote}>Keep Onboard</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Hybrid Barcode Input: Text Input + Camera Scan */}
              <View style={styles.barcodeSection}>
                <Text style={styles.barcodeSectionTitle}>
                  BARCODE VERIFICATION (HYBRID INPUT)
                </Text>

                <View style={styles.inputRow}>
                  <TextInput
                    value={barcodeInput}
                    onChangeText={setBarcodeInput}
                    placeholder={`Scan or enter ${targetContainer}...`}
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="characters"
                    style={styles.barcodeTextInput}
                  />
                  <Pressable
                    onPress={() => setIsScannerOpen(true)}
                    style={({ pressed }) => [
                      styles.cameraScanBtn,
                      pressed && styles.cameraScanBtnPressed,
                    ]}
                  >
                    <Camera size={18} color="#ffffff" />
                    <Text style={styles.cameraScanText}>SCAN</Text>
                  </Pressable>
                </View>

                {/* Quick Simulation Chips */}
                <View style={styles.simRow}>
                  <Text style={styles.simLabel}>Quick Sim:</Text>
                  <View style={styles.simChips}>
                    <Pressable
                      onPress={() => {
                        setBarcodeInput(targetContainer);
                        handleVerify(targetContainer);
                      }}
                      style={styles.simChipSuccess}
                    >
                      <Text style={styles.simChipSuccessText}>
                        Match ({targetContainer})
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setBarcodeInput('BOX-999');
                        handleVerify('BOX-999');
                      }}
                      style={styles.simChipDanger}
                    >
                      <Text style={styles.simChipDangerText}>
                        Mismatch (BOX-999)
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionsGrid}>
                <Button
                  label="Report Issue"
                  variant="outline"
                  icon={<AlertTriangle size={15} color={colors.danger} />}
                  onPress={onReportIssue}
                  style={styles.reportIssueBtn}
                  textStyle={{ color: colors.danger }}
                />
                <Button
                  label="Confirm Handover"
                  variant="primary"
                  icon={<Check size={16} color="#ffffff" />}
                  onPress={() => handleVerify()}
                  disabled={!barcodeInput.trim()}
                  style={styles.confirmBtn}
                />
              </View>

              {timeLeft <= 0 && (
                <View style={styles.timeoutAlert}>
                  <Text style={styles.timeoutAlertText}>
                    300s Handover timeout exceeded!
                  </Text>
                  <Pressable onPress={() => setTimeLeft(60)}>
                    <Text style={styles.timeoutExtendText}>
                      + Request 60s Extension
                    </Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          ) : (
            /* ================================================================
               SCR-STF-15: BARCODE MISMATCH ALERT MODAL
               ================================================================ */
            <View style={styles.mismatchContainer}>
              <View style={styles.mismatchHeaderRow}>
                <View style={styles.mismatchIconWrap}>
                  <AlertTriangle size={24} color={colors.danger} />
                </View>
                <View style={styles.mismatchTitleCol}>
                  <Text style={styles.mismatchTitle}>
                    SCR-STF-15: Barcode Mismatch!
                  </Text>
                  <Text style={styles.mismatchSubtitle}>
                    Scanned barcode does not match expected target {targetContainer} assigned for {location}.
                  </Text>
                </View>
              </View>

              {/* Comparison Box */}
              <View style={styles.comparisonGrid}>
                <View style={styles.comparisonCol}>
                  <Text style={styles.comparisonColLabel}>EXPECTED TARGET</Text>
                  <Text style={styles.comparisonExpectedVal}>{targetContainer}</Text>
                  <Text style={styles.comparisonSubtext}>{location}</Text>
                </View>

                <View style={[styles.comparisonCol, styles.comparisonColRight]}>
                  <Text style={styles.comparisonScannedLabel}>SCANNED BARCODE</Text>
                  <Text style={styles.comparisonScannedVal}>
                    {barcodeInput || 'BOX-999'}
                  </Text>
                  <Text style={styles.comparisonScannedSubtext}>
                    Wrong Tote / Misplaced
                  </Text>
                </View>
              </View>

              {/* Recovery Action Buttons */}
              <View style={styles.mismatchActions}>
                <Button
                  label="Retry Barcode Scan"
                  variant="primary"
                  size="lg"
                  icon={<RefreshCw size={17} color="#ffffff" />}
                  onPress={() => {
                    setMismatch(false);
                    setBarcodeInput('');
                  }}
                  style={{ width: '100%' }}
                />
                <Button
                  label="Report Misplaced Container"
                  variant="outline"
                  size="lg"
                  icon={<AlertTriangle size={16} color={colors.danger} />}
                  onPress={onReportIssue}
                  style={styles.mismatchReportBtn}
                  textStyle={{ color: colors.danger }}
                />
              </View>
            </View>
          )}
        </View>

        {/* Live Camera Scanner Overlay */}
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
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingTop: 10,
    ...shadows.sheet,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 4,
  },
  sheetScroll: {
    padding: 16,
  },
  sheetContent: {
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 12,
    marginBottom: 12,
  },
  headerTitleCol: {
    flex: 1,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontSans,
    letterSpacing: 0.6,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 99,
  },
  timerBadgeUrgent: {
    backgroundColor: '#fee2e2',
  },
  timerText: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: typography.fontMono,
    color: '#92400e',
  },
  timerTextUrgent: {
    color: colors.danger,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  sheetSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  schematicCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 12,
  },
  schematicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  schematicTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
    letterSpacing: 0.5,
  },
  schematicBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  slotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  slotCard: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotCardTarget: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  slotCardLocked: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
    opacity: 0.7,
  },
  slotLabel: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 2,
  },
  slotCode: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: typography.fontMono,
    color: colors.textPrimary,
  },
  slotCodeTarget: {
    color: colors.primary,
  },
  slotTag: {
    marginTop: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  slotTagTarget: {
    backgroundColor: colors.primary,
  },
  slotTagLocked: {
    backgroundColor: colors.surfaceMuted,
  },
  slotTagText: {
    fontSize: 7,
    fontWeight: '900',
    color: colors.textMuted,
  },
  slotTagTextTarget: {
    color: '#ffffff',
  },
  targetContainerCard: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'rgba(37, 99, 235, 0.04)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  targetCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  targetIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  targetCardTag: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.primary,
  },
  actionPill: {
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  actionPillText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900',
  },
  targetInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 8,
  },
  targetCodeText: {
    fontSize: 17,
    fontWeight: '900',
    fontFamily: typography.fontMono,
    color: colors.textPrimary,
  },
  targetQtyText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  targetDestBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  targetDestLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  targetDestValue: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 2,
  },
  keepOnboardCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: 10,
    backgroundColor: colors.surfaceSubtle,
    marginBottom: 12,
  },
  keepOnboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  keepOnboardTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.textMuted,
  },
  keepOnboardCount: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  keepOnboardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  keepOnboardCode: {
    fontSize: 11,
    fontFamily: typography.fontMono,
    color: colors.textPrimary,
  },
  keepOnboardNote: {
    fontSize: 10,
    color: colors.textMuted,
  },
  barcodeSection: {
    marginBottom: 16,
  },
  barcodeSectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  barcodeTextInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: typography.fontMono,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cameraScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    height: 48,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  cameraScanBtnPressed: {
    backgroundColor: colors.primaryDark,
  },
  cameraScanText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  simRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  simLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  simChips: {
    flexDirection: 'row',
    gap: 6,
  },
  simChipSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  simChipSuccessText: {
    fontSize: 9,
    fontFamily: typography.fontMono,
    fontWeight: '800',
    color: colors.success,
  },
  simChipDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  simChipDangerText: {
    fontSize: 9,
    fontFamily: typography.fontMono,
    fontWeight: '800',
    color: colors.danger,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  reportIssueBtn: {
    flex: 0.42,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  confirmBtn: {
    flex: 0.58,
  },
  timeoutAlert: {
    marginTop: 12,
    backgroundColor: '#fee2e2',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  timeoutAlertText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.danger,
  },
  timeoutExtendText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.primary,
    textDecorationLine: 'underline',
    marginTop: 4,
  },
  mismatchContainer: {
    padding: 16,
    borderTopWidth: 4,
    borderTopColor: colors.danger,
    paddingBottom: 36,
  },
  mismatchHeaderRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  mismatchIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mismatchTitleCol: {
    flex: 1,
  },
  mismatchTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.danger,
    fontFamily: typography.fontSans,
  },
  mismatchSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
    marginTop: 4,
    lineHeight: 16,
  },
  comparisonGrid: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  comparisonCol: {
    flex: 1,
  },
  comparisonColRight: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    paddingLeft: 12,
  },
  comparisonColLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  comparisonExpectedVal: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: typography.fontMono,
    color: colors.textPrimary,
    marginTop: 4,
  },
  comparisonSubtext: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  comparisonScannedLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.danger,
    textTransform: 'uppercase',
  },
  comparisonScannedVal: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: typography.fontMono,
    color: colors.danger,
    marginTop: 4,
  },
  comparisonScannedSubtext: {
    fontSize: 10,
    color: colors.danger,
    marginTop: 2,
  },
  mismatchActions: {
    gap: 10,
  },
  mismatchReportBtn: {
    width: '100%',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
});

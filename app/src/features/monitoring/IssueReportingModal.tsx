import { mobileCapabilities } from '../../shared/api/capabilities';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { t, translateText } from '../../shared/i18n';
import { RawText as Text } from '../../shared/ui/Text';
import {
  AlertOctagon,
  AlertTriangle,
  Box,
  Camera,
  Check,
  PauseCircle,
  ScanLine,
  ShieldAlert,
  Warehouse,
} from 'lucide-react-native';
import { Button } from '../../shared/components/Button';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { ThemeShadows } from '../../shared/theme/shadows';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';
import type { IssueAndPauseOutcome, IssueReceipt } from '../jobs/jobData';

export type IncidentCategory =
  | 'WRONG_CONTAINER'
  | 'MISSING_CONTAINER'
  | 'CONTAINER_DAMAGED'
  | 'BARCODE_UNREADABLE'
  | 'SHELF_BLOCKED'
  | 'QUANTITY_MISMATCH'
  | 'AMR_PATH_BLOCKED';

export interface IssueSubmitInput {
  category: IncidentCategory;
  notes: string;
  pauseJob: boolean;
  containerId?: string;
  existingIssue?: IssueReceipt | null;
}

interface IssueReportingModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: IssueSubmitInput) => Promise<IssueAndPauseOutcome>;
  onRefreshJob?: () => Promise<unknown>;
  robotCode?: string;
  jobId?: string;
  containerCode?: string;
  containers?: { containerId: string; code: string }[];
  initialCategory?: IncidentCategory;
  initialContainerId?: string;
  canPause?: boolean;
}

const CONTAINER_CATEGORIES = new Set<IncidentCategory>([
  'WRONG_CONTAINER',
  'MISSING_CONTAINER',
  'CONTAINER_DAMAGED',
  'BARCODE_UNREADABLE',
  'QUANTITY_MISMATCH',
]);

const CATEGORIES: {
  id: IncidentCategory;
  title: string;
  desc: string;
  icon: 'triangle' | 'scan' | 'warehouse' | 'box' | 'octagon';
}[] = [
  {
    id: 'WRONG_CONTAINER',
    title: 'Wrong container at stop · Blocks Confirm',
    desc: 'Scanned or onboard tote does not match the handover manifest',
    icon: 'triangle',
  },
  {
    id: 'MISSING_CONTAINER',
    title: 'Missing container at stop · Blocks Confirm',
    desc: 'Expected tote cannot be found at pickup or on robot bay',
    icon: 'box',
  },
  {
    id: 'CONTAINER_DAMAGED',
    title: 'Container damaged / crushed',
    desc: 'Physical puncture, cracked rim, broken handle, or spilled cargo',
    icon: 'triangle',
  },
  {
    id: 'BARCODE_UNREADABLE',
    title: 'Barcode unreadable / smeared',
    desc: 'Label missing, scuffed code 128, distorted or smeared print',
    icon: 'scan',
  },
  {
    id: 'SHELF_BLOCKED',
    title: 'Shelf location blocked / full',
    desc: 'Destination bin occupied, mechanical overhang, or damaged rack slot',
    icon: 'warehouse',
  },
  {
    id: 'QUANTITY_MISMATCH',
    title: 'Quantity mismatch / missing items',
    desc: 'Piece count inside tote differs from digital WMS packing list',
    icon: 'box',
  },
  {
    id: 'AMR_PATH_BLOCKED',
    title: 'AMR corridor blocked / obstacle',
    desc: 'Aisle corridor obstructed by pallet or vehicle, safety laser tripped',
    icon: 'octagon',
  },
];

export function IssueReportingModal({
  visible,
  onClose,
  onSubmit,
  onRefreshJob,
  robotCode = 'Unassigned',
  jobId = '',
  containerCode,
  containers = [],
  initialCategory,
  initialContainerId,
  canPause = false,
}: IssueReportingModalProps) {
  const { styles, colors } = useThemedStyles(createStyles);
  const [selectedCat, setSelectedCat] = useState<IncidentCategory>(initialCategory ?? 'CONTAINER_DAMAGED');
  const [selectedContainerId, setSelectedContainerId] = useState<string | undefined>(
    initialContainerId ?? containers[0]?.containerId,
  );
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState<'report' | 'pause' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdIssue, setCreatedIssue] = useState<IssueReceipt | null>(null);
  const [pauseUncertain, setPauseUncertain] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedCat(initialCategory ?? 'CONTAINER_DAMAGED');
      setSelectedContainerId(initialContainerId ?? containers[0]?.containerId);
      setNotes('');
      setIsSubmitting(null);
      setSubmitError(null);
      setCreatedIssue(null);
      setPauseUncertain(false);
    }
  }, [visible, jobId, containerCode, initialCategory, initialContainerId, containers]);

  const handleAction = async (shouldPause: boolean) => {
    if (isSubmitting) return;
    triggerHaptic('warning');
    setIsSubmitting(shouldPause ? 'pause' : 'report');
    setSubmitError(null);
    try {
      const isContainerCategory = CONTAINER_CATEGORIES.has(selectedCat);
      const outcome = await onSubmit({
        category: selectedCat,
        notes,
        pauseJob: shouldPause,
        containerId: isContainerCategory ? selectedContainerId : undefined,
        existingIssue: createdIssue,
      });
      if (outcome.pauseError) {
        setCreatedIssue(outcome.issue);
        setPauseUncertain(outcome.pauseUncertain);
        setSubmitError(
          outcome.pauseError instanceof Error
            ? outcome.pauseError.message
            : t('Job could not be paused. Refresh the job before trying again.'),
        );
        return;
      }
      onClose();
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : t('Incident could not be recorded.'));
    } finally {
      setIsSubmitting(null);
    }
  };

  if (!visible) return null;

  const formLocked = Boolean(createdIssue) || Boolean(isSubmitting);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={isSubmitting ? () => {} : onClose}
    >
      <View style={styles.fullScreenContainer}>
        <SubScreenHeader
          label={containerCode ? `Incident report · ${robotCode} · ${containerCode}` : `Incident report · ${robotCode}`}
          title="Report Exception"
          onBack={isSubmitting ? () => {} : onClose}
        />

        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Safety Warning */}
          <View style={styles.safetyBox}>
            <ShieldAlert size={20} color="#dc2626" style={{ marginTop: 2 }} />
            <View style={styles.safetyTextWrap}>
              <Text style={styles.safetyBold}>Safety protocol active</Text>
              <Text style={styles.safetyDesc}>
                Report the issue to your supervisor. Submitting a report does not confirm that the robot has stopped.
              </Text>
            </View>
          </View>

          {createdIssue && (
            <View style={styles.partialBox}>
              <Text style={styles.partialTitle}>
                {t('Issue {code} recorded', { code: createdIssue.code })}
              </Text>
              <Text style={styles.partialDesc}>
                {pauseUncertain
                  ? t('The pause result could not be confirmed. Refresh the job to verify whether it paused before retrying.')
                  : t('The ticket is saved. Retry pausing only, without creating another ticket.')}
              </Text>
            </View>
          )}

          {/* 1. Category Picker */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Incident category</Text>
            <View style={{ gap: 8 }}>
              {CATEGORIES.map((c) => {
                const isSelected = selectedCat === c.id;
                return (
                  <Pressable
                    key={c.id}
                    disabled={formLocked}
                    onPress={() => {
                      triggerHaptic('tap');
                      setSelectedCat(c.id);
                    }}
                    style={[
                      styles.catCard,
                      isSelected && styles.catCardSelected,
                      formLocked && styles.locked,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected, disabled: formLocked }}
                  >
                    <View
                      style={[
                        styles.catIconWrap,
                        isSelected && styles.catIconWrapSelected,
                      ]}
                    >
                      {c.icon === 'triangle' ? (
                        <AlertTriangle size={16} color={isSelected ? '#ffffff' : colors.textSecondary} />
                      ) : c.icon === 'scan' ? (
                        <ScanLine size={16} color={isSelected ? '#ffffff' : colors.textSecondary} />
                      ) : c.icon === 'warehouse' ? (
                        <Warehouse size={16} color={isSelected ? '#ffffff' : colors.textSecondary} />
                      ) : c.icon === 'box' ? (
                        <Box size={16} color={isSelected ? '#ffffff' : colors.textSecondary} />
                      ) : (
                        <AlertOctagon size={16} color={isSelected ? '#ffffff' : colors.textSecondary} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.catTitle,
                          isSelected && styles.catTitleSelected,
                        ]}
                      >
                        {c.title}
                      </Text>
                    </View>
                    {isSelected && (
                      <View style={styles.checkBadge}>
                        <Check size={14} color="#ffffff" />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {CONTAINER_CATEGORIES.has(selectedCat) && containers.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Affected Container</Text>
              <View style={styles.containerChipRow}>
                {containers.map((item) => {
                  const chosen = selectedContainerId === item.containerId;
                  return (
                    <Pressable
                      key={item.containerId}
                      disabled={formLocked}
                      onPress={() => {
                        triggerHaptic('tap');
                        setSelectedContainerId(item.containerId);
                      }}
                      style={[styles.containerChip, chosen && styles.containerChipSelected, formLocked && styles.locked]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: chosen, disabled: formLocked }}
                    >
                      <Text style={[styles.containerChipText, chosen && styles.containerChipTextSelected]}>
                        {item.code}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {(selectedCat === 'WRONG_CONTAINER' || selectedCat === 'MISSING_CONTAINER') && (
                <Text style={styles.blockingHint}>
                  Wrong or missing container issues block handover confirmation until verified with the expected container barcode.
                </Text>
              )}
            </View>
          )}

          {/* Photo Evidence */}
          <View style={styles.evidenceCard}>
            <View style={styles.evidenceHeader}>
              <Text style={styles.sectionLabel}>Photo evidence</Text>
              <View style={styles.evidenceBadge}>
                <Text style={styles.evidenceBadgeText}>Unavailable</Text>
              </View>
            </View>
            <View style={styles.evidenceUnavailable}>
              <Camera size={16} color={colors.textMuted} />
              <Text style={styles.evidenceUnavailableText}>
                Photo upload is not configured on this server yet. Submit the report without a photo.
              </Text>
            </View>
          </View>

          {/* 3. Operator Notes */}
          <View style={styles.notesCard}>
            <Text style={styles.sectionLabel}>Operator description</Text>
            <TextInput
              accessibilityLabel={translateText('Operator description')}
              value={notes}
              onChangeText={setNotes}
              editable={!formLocked}
              maxLength={500}
              placeholder={translateText('e.g. Left corner cracked, 2 units dislodged onto lane 2...')}
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              style={[styles.notesInput, formLocked && styles.locked]}
            />
          </View>
        </ScrollView>

        {!mobileCapabilities.reportIssue && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>Reporting is unavailable on this backend. Contact the supervisor directly.</Text>
          </View>
        )}
        {submitError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText} accessibilityRole="alert">{submitError}</Text>
          </View>
        )}
        <View style={styles.footer}>
          {createdIssue ? (
            <View style={styles.footerStack}>
              {canPause && (
                <Button
                  label="Retry Pause Only"
                  icon={<PauseCircle size={18} color="#ffffff" />}
                  onPress={() => { void handleAction(true); }}
                  disabled={Boolean(isSubmitting)}
                  loading={isSubmitting === 'pause'}
                  variant="danger"
                  size="lg"
                  style={{ width: '100%' }}
                />
              )}
              <Button
                label="Refresh & Close"
                onPress={() => {
                  void onRefreshJob?.();
                  onClose();
                }}
                disabled={Boolean(isSubmitting)}
                variant="outline"
                size="md"
                style={{ width: '100%' }}
              />
            </View>
          ) : (
            <View style={styles.footerStack}>
              {canPause && (
                <Button
                  label="Submit & Pause Job"
                  icon={<PauseCircle size={18} color="#ffffff" />}
                  onPress={() => { void handleAction(true); }}
                  disabled={Boolean(isSubmitting) || !mobileCapabilities.reportIssue}
                  loading={isSubmitting === 'pause'}
                  variant="danger"
                  size="lg"
                  style={{ width: '100%' }}
                />
              )}
              <Button
                label="Submit Report"
                icon={<AlertTriangle size={18} color={canPause ? colors.textPrimary : '#ffffff'} />}
                onPress={() => { void handleAction(false); }}
                disabled={Boolean(isSubmitting) || !mobileCapabilities.reportIssue}
                loading={isSubmitting === 'report'}
                variant={canPause ? 'outline' : 'primary'}
                size="lg"
                style={{ width: '100%' }}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  locked: {
    opacity: 0.6,
  },
  partialBox: {
    backgroundColor: colors.warningBg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    padding: 14,
    gap: 4,
  },
  partialTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.warningText,
    fontFamily: typography.fontSans,
  },
  partialDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.warningText,
    fontFamily: typography.fontSans,
  },
  safetyBox: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
    padding: 14,
    ...shadows.panel,
  },
  safetyTextWrap: {
    flex: 1,
  },
  safetyBold: {
    fontSize: 14,
    fontWeight: '700',
    color: '#dc2626',
    fontFamily: typography.fontSans,
  },
  safetyDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  catCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 48,
    ...shadows.panel,
  },
  catCardSelected: {
    borderColor: colors.darkAction,
    borderWidth: 1.5,
  },
  catIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catIconWrapSelected: {
    backgroundColor: colors.darkAction,
  },
  catTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  catTitleSelected: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  containerChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  containerChip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  containerChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  containerChipText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: typography.fontMono,
    color: colors.textPrimary,
  },
  containerChipTextSelected: {
    color: colors.primaryText,
  },
  blockingHint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.warningText,
    fontFamily: typography.fontSans,
  },
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.darkAction,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evidenceCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.panel,
    gap: 10,
  },
  evidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  evidenceBadge: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  evidenceBadgeAttached: {
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
    borderColor: 'rgba(22, 163, 74, 0.25)',
  },
  evidenceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  evidenceBadgeTextAttached: {
    color: '#16a34a',
    fontWeight: '700',
  },
  cameraBox: {
    backgroundColor: '#0f172a',
    borderRadius: radii.md,
    padding: 14,
    minHeight: 180,
    justifyContent: 'space-between',
  },
  camTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  camRecText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: typography.fontMono,
  },
  camDeviceText: {
    color: '#94a3b8',
    fontSize: 12,
    fontFamily: typography.fontMono,
  },
  camReticle: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  camReticleText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '500',
    fontFamily: typography.fontSans,
  },
  camActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shutterBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.darkAction,
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  previewIconBox: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewFilename: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  previewMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retakeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  deletePhotoBtn: {
    padding: 6,
  },
  notesCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.panel,
    gap: 8,
  },
  notesInput: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
    fontFamily: typography.fontSans,
  },
  evidenceUnavailable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  evidenceUnavailableText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  errorBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.dangerBg,
    borderTopWidth: 1,
    borderTopColor: colors.dangerBorder,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.dangerText,
    fontFamily: typography.fontSans,
  },
  footer: {
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerStack: {
    gap: 10,
  },
});

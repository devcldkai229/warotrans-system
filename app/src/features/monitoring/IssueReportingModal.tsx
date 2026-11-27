import { mobileCapabilities } from '../../shared/api/capabilities';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../shared/i18n';
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
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { typography } from '../../shared/theme/typography';
import { Button, Card, StatusPill, Text, TextField } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import type { IssueStatus } from '../../shared/types/contracts';
import type { IssueAndPauseOutcome, IssueReceipt } from '../jobs/jobData';
import { IssuePhotoSection } from '../safety/IssuePhotoSection';

export type IncidentCategory =
  | 'WRONG_CONTAINER'
  | 'MISSING_CONTAINER'
  | 'CONTAINER_DAMAGED'
  | 'BARCODE_UNREADABLE'
  | 'UNSAFE_LOAD'
  | 'SHELF_BLOCKED'
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
  'UNSAFE_LOAD',
]);

const CATEGORIES: {
  id: IncidentCategory;
  title: string;
  desc: string;
  blocksHandover?: boolean;
  icon: 'triangle' | 'scan' | 'warehouse' | 'box' | 'octagon';
}[] = [
  {
    id: 'WRONG_CONTAINER',
    title: 'Wrong container at stop',
    desc: 'Scanned or onboard tote does not match the handover manifest',
    blocksHandover: true,
    icon: 'triangle',
  },
  {
    id: 'MISSING_CONTAINER',
    title: 'Missing container at stop',
    desc: 'Expected tote cannot be found at pickup or on robot bay',
    blocksHandover: true,
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
    id: 'UNSAFE_LOAD',
    title: 'Unsafe to carry',
    desc: 'Too heavy, too large or stacked unsafely for the robot',
    icon: 'octagon',
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
  const insets = useSafeAreaInsets();
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
            <ShieldAlert size={20} color={colors.dangerText} style={{ marginTop: 2, flexShrink: 0 }} />
            <View style={styles.safetyTextWrap}>
              <Text variant="bodyMedium" fontWeight="700" color="dangerText">
                Safety protocol active
              </Text>
              <Text variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
                Report the issue to your supervisor. Submitting a report does not confirm that the robot has stopped.
              </Text>
            </View>
          </View>

          {createdIssue && (
            <View style={styles.partialBox}>
              <Text variant="bodyMedium" fontWeight="700" color="warningText">
                {t('Issue {code} recorded', { code: createdIssue.code })}
              </Text>
              <Text variant="caption" color="warningText">
                {pauseUncertain
                  ? t('The pause result could not be confirmed. Refresh the job to verify whether it paused before retrying.')
                  : t('The ticket is saved. Retry pausing only, without creating another ticket.')}
              </Text>
            </View>
          )}

          {/* 1. Category Picker */}
          <View style={styles.section}>
            <Text variant="label" color="textPrimary" fontWeight="600">Incident category</Text>
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
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <View style={styles.catTitleRow}>
                        <Text
                          variant="bodyMedium"
                          fontWeight={isSelected ? '700' : '600'}
                          color="textPrimary"
                          style={{ flexShrink: 1 }}
                        >
                          {c.title}
                        </Text>
                        {c.blocksHandover ? (
                          <StatusPill status="WAITING" label="Blocks Handover" tone="warning" size="sm" />
                        ) : null}
                      </View>
                      <Text variant="caption" color="textSecondary">
                        {c.desc}
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
              <Text variant="label" color="textPrimary" fontWeight="600">Affected Container</Text>
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
                      <Text
                        variant="code"
                        fontWeight="600"
                        color={chosen ? 'primaryText' : 'textPrimary'}
                      >
                        {item.code}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {(selectedCat === 'WRONG_CONTAINER' || selectedCat === 'MISSING_CONTAINER') && (
                <Text variant="caption" color="warningText">
                  Wrong or missing container issues block handover confirmation until verified with the expected container barcode.
                </Text>
              )}
            </View>
          )}

          {/* 3. Operator Notes */}
          <Card padding="md" gap={10}>
            <TextField
              label="Operator description"
              accessibilityLabel="Operator description"
              value={notes}
              onChangeText={setNotes}
              editable={!formLocked}
              maxLength={500}
              placeholder="e.g. Left corner cracked, 2 units dislodged onto lane 2..."
              multiline
              numberOfLines={3}
            />

            {createdIssue && typeof createdIssue.version === 'number' ? (
              <IssuePhotoSection
                issue={{
                  id: createdIssue.id,
                  version: createdIssue.version,
                  status: createdIssue.status as IssueStatus,
                  evidence: createdIssue.evidence ?? [],
                }}
                canUpload
                onUploaded={(updated) => {
                  setCreatedIssue(updated);
                  void onRefreshJob?.();
                }}
                onRefreshIssue={onRefreshJob}
              />
            ) : (
              <View style={styles.photoHintRow}>
                <Camera size={15} color={colors.textMuted} style={{ flexShrink: 0 }} />
                <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                  Photos can be attached under Reported Issues after submitting.
                </Text>
              </View>
            )}
          </Card>
        </ScrollView>

        {!mobileCapabilities.reportIssue && (
          <View style={styles.errorBanner}>
            <Text variant="label" color="dangerText">
              Reporting is unavailable on this backend. Contact the supervisor directly.
            </Text>
          </View>
        )}
        {submitError && (
          <View style={styles.errorBanner}>
            <Text variant="label" color="dangerText" accessibilityRole="alert">
              {submitError}
            </Text>
          </View>
        )}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {createdIssue ? (
            <View style={styles.footerStack}>
              {canPause && (
                <Button
                  title="Retry Pause Only"
                  icon={PauseCircle}
                  onPress={() => { void handleAction(true); }}
                  disabled={Boolean(isSubmitting)}
                  loading={isSubmitting === 'pause'}
                  variant="danger"
                  size="lg"
                  fullWidth
                />
              )}
              <Button
                title="Refresh & Close"
                onPress={() => {
                  void onRefreshJob?.();
                  onClose();
                }}
                disabled={Boolean(isSubmitting)}
                variant="outline"
                size="md"
                fullWidth
              />
            </View>
          ) : (
            <View style={styles.footerStack}>
              {canPause && (
                <Button
                  title="Submit & Pause Job"
                  icon={PauseCircle}
                  onPress={() => { void handleAction(true); }}
                  disabled={Boolean(isSubmitting) || !mobileCapabilities.reportIssue}
                  loading={isSubmitting === 'pause'}
                  variant="danger"
                  size="lg"
                  fullWidth
                />
              )}
              <Button
                title="Submit Report"
                icon={AlertTriangle}
                onPress={() => { void handleAction(false); }}
                disabled={Boolean(isSubmitting) || !mobileCapabilities.reportIssue}
                loading={isSubmitting === 'report'}
                variant={canPause ? 'outline' : 'primary'}
                size="lg"
                fullWidth
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
  safetyBox: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    padding: 14,
  },
  safetyTextWrap: {
    flex: 1,
  },
  section: {
    gap: 8,
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
    paddingVertical: 10,
    minHeight: 52,
  },
  catCardSelected: {
    borderColor: colors.darkAction,
    borderWidth: 1.5,
  },
  catIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  catIconWrapSelected: {
    backgroundColor: colors.darkAction,
  },
  catTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
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
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.darkAction,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  photoHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  errorBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.dangerBg,
    borderTopWidth: 1,
    borderTopColor: colors.dangerBorder,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerStack: {
    gap: 10,
  },
});

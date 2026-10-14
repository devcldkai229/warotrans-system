import React, { useState } from 'react';
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
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Box,
  Camera,
  Check,
  Image as ImageIcon,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  Warehouse,
  X,
} from 'lucide-react-native';
import { Button } from '../../shared/components/Button';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { toast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';

export type IncidentCategory =
  | 'CONTAINER_DAMAGED'
  | 'BARCODE_UNREADABLE'
  | 'SHELF_BLOCKED'
  | 'QUANTITY_MISMATCH'
  | 'AMR_PATH_BLOCKED';

interface IssueReportingModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (category: IncidentCategory, notes: string) => void;
  robotCode?: string;
  jobId?: string;
}

const CATEGORIES: {
  id: IncidentCategory;
  title: string;
  desc: string;
  icon: 'triangle' | 'scan' | 'warehouse' | 'box' | 'octagon';
}[] = [
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
  robotCode = 'AMR-01',
  jobId = 'JOB-2026-0812',
}: IssueReportingModalProps) {
  const [selectedCat, setSelectedCat] = useState<IncidentCategory>('CONTAINER_DAMAGED');
  const [notes, setNotes] = useState('');
  const [photoAttached, setPhotoAttached] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  const handleSubmit = () => {
    triggerHaptic('warning');
    onSubmit(selectedCat, notes);
    onClose();
    toast.error(`Exception submitted for ${jobId}. Task paused and supervisor notified.`);
  };

  const handleSnapPhoto = () => {
    triggerHaptic('success');
    setPhotoAttached(true);
    setCameraActive(false);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.fullScreenContainer}>
        <SubScreenHeader
          label={`Incident report · ${robotCode}`}
          title="Report Exception"
          onBack={onClose}
        />

        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Safety Warning */}
          <View style={styles.safetyBox}>
            <ShieldAlert size={20} color="#dc2626" style={{ marginTop: 2 }} />
            <View style={styles.safetyTextWrap}>
              <Text style={styles.safetyBold}>Safety protocol active</Text>
              <Text style={styles.safetyDesc}>
                Submitting this report will place <Text style={{ fontWeight: '700' }}>{robotCode}</Text> in emergency hold status. Dispatcher and supervisor will be alerted immediately.
              </Text>
            </View>
          </View>

          {/* 1. Category Picker */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Incident category</Text>
            <View style={{ gap: 8 }}>
              {CATEGORIES.map((c) => {
                const isSelected = selectedCat === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      triggerHaptic('tap');
                      setSelectedCat(c.id);
                    }}
                    style={[
                      styles.catCard,
                      isSelected && styles.catCardSelected,
                    ]}
                    accessibilityRole="button"
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
                      <Text style={styles.catDesc}>{c.desc}</Text>
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

          {/* Photo Evidence */}
          <View style={styles.evidenceCard}>
            <View style={styles.evidenceHeader}>
              <View>
                <Text style={styles.sectionLabel}>Photo evidence</Text>
                <Text style={styles.evidenceSub}>Attach proof for shift supervisor review</Text>
              </View>
              <View style={[styles.evidenceBadge, photoAttached && styles.evidenceBadgeAttached]}>
                <Text style={[styles.evidenceBadgeText, photoAttached && styles.evidenceBadgeTextAttached]}>
                  {photoAttached ? 'Attached' : 'Optional'}
                </Text>
              </View>
            </View>

            {!photoAttached ? (
              cameraActive ? (
                <View style={styles.cameraBox}>
                  <View style={styles.camTop}>
                    <Text style={styles.camRecText}>● Live viewfinder</Text>
                    <Text style={styles.camDeviceText}>Camera 01</Text>
                  </View>
                  <View style={styles.camReticle}>
                    <Text style={styles.camReticleText}>Align defect within frame</Text>
                  </View>
                  <View style={styles.camActions}>
                    <Button
                      label="Cancel"
                      onPress={() => setCameraActive(false)}
                      variant="outline"
                      size="sm"
                    />
                    <Pressable onPress={handleSnapPhoto} style={styles.shutterBtn}>
                      <Camera size={20} color="#ffffff" />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Button
                  label="Open Camera to Capture Evidence"
                  icon={<Camera size={16} color={colors.textPrimary} />}
                  onPress={() => setCameraActive(true)}
                  variant="outline"
                  size="md"
                  style={{ marginTop: 6 }}
                />
              )
            ) : (
              <View style={styles.previewCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={styles.previewIconBox}>
                    <ImageIcon size={20} color={colors.textPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.previewFilename} numberOfLines={1}>
                      DEFECT_{selectedCat.substring(0, 8)}.JPG
                    </Text>
                    <Text style={styles.previewMeta}>Evidence attached · 1.4 MB</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Pressable onPress={() => setCameraActive(true)} style={styles.retakeBtn}>
                    <RefreshCw size={13} color={colors.textPrimary} />
                    <Text style={styles.retakeText}>Retake</Text>
                  </Pressable>
                  <Pressable onPress={() => setPhotoAttached(false)} style={styles.deletePhotoBtn}>
                    <X size={15} color="#dc2626" />
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          {/* 3. Operator Notes */}
          <View style={styles.notesCard}>
            <Text style={styles.sectionLabel}>Operator description</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Left corner cracked, 2 units dislodged onto lane 2..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              style={styles.notesInput}
            />
          </View>
        </ScrollView>

        {/* Bottom Fixed Action in Warm Dark Gray */}
        <View style={styles.footer}>
          <Button
            label="Submit Exception & Pause Task"
            icon={<AlertTriangle size={18} color="#ffffff" />}
            onPress={handleSubmit}
            variant="primary"
            size="lg"
            style={{ width: '100%' }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  safetyBox: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#ffffff',
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
    backgroundColor: '#ffffff',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    minHeight: 64,
    ...shadows.panel,
  },
  catCardSelected: {
    borderColor: colors.darkAction,
    borderWidth: 1.5,
  },
  catIconWrap: {
    width: 36,
    height: 36,
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
    color: colors.darkAction,
  },
  catDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
    fontFamily: typography.fontSans,
  },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.darkAction,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evidenceCard: {
    backgroundColor: '#ffffff',
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
    alignItems: 'flex-start',
  },
  evidenceSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    fontFamily: typography.fontSans,
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
    backgroundColor: '#ffffff',
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
    backgroundColor: '#ffffff',
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
    backgroundColor: '#ffffff',
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
  footer: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

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
  Box,
  Camera,
  Image as ImageIcon,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  Warehouse,
  X,
} from 'lucide-react-native';
import { Button } from '../../shared/components/Button';
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
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
    title: 'Container Damaged / Crushed',
    desc: 'Physical puncture, cracked rim, broken handle, or spilled cargo',
    icon: 'triangle',
  },
  {
    id: 'BARCODE_UNREADABLE',
    title: 'Barcode / QR Unreadable',
    desc: 'Label missing, scuffed code 128, distorted or smeared print',
    icon: 'scan',
  },
  {
    id: 'SHELF_BLOCKED',
    title: 'Shelf Location Blocked / Full',
    desc: 'Destination bin occupied, mechanical overhang, or damaged rack slot',
    icon: 'warehouse',
  },
  {
    id: 'QUANTITY_MISMATCH',
    title: 'Quantity Mismatch / Missing Items',
    desc: 'Piece count inside tote differs from digital WMS packing list',
    icon: 'box',
  },
  {
    id: 'AMR_PATH_BLOCKED',
    title: 'AMR Path Blocked / Deadlocked',
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
  };

  const handleSnapPhoto = () => {
    triggerHaptic('tick');
    setPhotoAttached(true);
    setCameraActive(false);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Top Drag Handle Indicator */}
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTag}>
                SCR-STF-16 · {robotCode} · {jobId}
              </Text>
              <Text style={styles.title}>Report Exception & Incident</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            {/* Safety Warning */}
            <View style={styles.safetyBox}>
              <ShieldAlert size={18} color={colors.danger} style={{ marginTop: 2 }} />
              <View style={styles.safetyTextWrap}>
                <Text style={styles.safetyBold}>Safety Perimeter Protocol Active</Text>
                <Text style={styles.safetyDesc}>
                  Submitting this report will place <Text style={{ fontWeight: '900' }}>{robotCode}</Text> in emergency HOLD status. Dispatcher and Shift Supervisor will be alerted immediately.
                </Text>
              </View>
            </View>

            {/* 1. Category Picker */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>1. SELECT INCIDENT CATEGORY (REQUIRED)</Text>
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
                    >
                      <View
                        style={[
                          styles.catIconWrap,
                          isSelected && styles.catIconWrapSelected,
                        ]}
                      >
                        {c.icon === 'triangle' ? (
                          <AlertTriangle
                            size={16}
                            color={isSelected ? '#ffffff' : colors.textMuted}
                          />
                        ) : c.icon === 'scan' ? (
                          <ScanLine
                            size={16}
                            color={isSelected ? '#ffffff' : colors.textMuted}
                          />
                        ) : c.icon === 'warehouse' ? (
                          <Warehouse
                            size={16}
                            color={isSelected ? '#ffffff' : colors.textMuted}
                          />
                        ) : c.icon === 'box' ? (
                          <Box
                            size={16}
                            color={isSelected ? '#ffffff' : colors.textMuted}
                          />
                        ) : (
                          <AlertOctagon
                            size={16}
                            color={isSelected ? '#ffffff' : colors.textMuted}
                          />
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
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 2. Photo Evidence (SCR-STF-17) */}
            <View style={styles.evidenceCard}>
              <View style={styles.evidenceHeader}>
                <View>
                  <Text style={styles.sectionLabel}>2. SCR-STF-17: PHOTO EVIDENCE</Text>
                  <Text style={styles.evidenceSub}>Attach physical proof for supervisor</Text>
                </View>
                <View style={[styles.evidenceBadge, photoAttached && styles.evidenceBadgeAttached]}>
                  <Text style={[styles.evidenceBadgeText, photoAttached && styles.evidenceBadgeTextAttached]}>
                    {photoAttached ? 'ATTACHED' : 'OPTIONAL'}
                  </Text>
                </View>
              </View>

              {!photoAttached ? (
                cameraActive ? (
                  /* Simulated Camera Viewfinder */
                  <View style={styles.cameraBox}>
                    <View style={styles.camTop}>
                      <Text style={styles.camRecText}>● REC 1080p</Text>
                      <Text style={styles.camDeviceText}>PDA CAM-01</Text>
                    </View>
                    <View style={styles.camReticle}>
                      <View style={styles.camCenterLine} />
                      <Text style={styles.camReticleText}>Align defect within frame</Text>
                    </View>
                    <View style={styles.camActions}>
                      <Button
                        label="Cancel"
                        onPress={() => setCameraActive(false)}
                        variant="secondary"
                        size="sm"
                      />
                      <Pressable onPress={handleSnapPhoto} style={styles.shutterBtn}>
                        <Camera size={22} color="#ffffff" />
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Button
                    label="Open Camera to Capture Evidence"
                    icon={<Camera size={16} color={colors.primary} />}
                    onPress={() => setCameraActive(true)}
                    variant="outline"
                    size="md"
                    style={styles.openCamBtn}
                    textStyle={{ color: colors.primary, fontWeight: '800' }}
                  />
                )
              ) : (
                /* Photo Thumbnail Preview Card */
                <View style={styles.previewCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={styles.previewIconBox}>
                      <ImageIcon size={22} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={styles.previewFilename}>
                        IMG_20260924_{selectedCat.substring(0, 8)}.JPG
                      </Text>
                      <Text style={styles.previewMeta}>Evidence Attached · 1.4 MB · High-Res</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pressable onPress={() => setCameraActive(true)} style={styles.retakeBtn}>
                      <RefreshCw size={12} color={colors.primary} />
                      <Text style={styles.retakeText}>Retake</Text>
                    </Pressable>
                    <Pressable onPress={() => setPhotoAttached(false)} style={styles.deletePhotoBtn}>
                      <X size={14} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            {/* 3. Operator Notes */}
            <View style={styles.notesCard}>
              <Text style={styles.sectionLabel}>3. OPERATOR DESCRIPTION NOTES</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="E.g., Left corner cracked, 2 units dislodged onto lane 2..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                style={styles.notesInput}
              />
            </View>
          </ScrollView>

          {/* Bottom Fixed Action */}
          <View style={styles.footer}>
            <Button
              label="Submit Exception & Pause Task"
              icon={<AlertTriangle size={18} color="#ffffff" />}
              onPress={handleSubmit}
              variant="danger"
              size="lg"
            />
          </View>
        </View>
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
  modalContent: {
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTag: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontMono,
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  scrollArea: {
    maxHeight: 520,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  safetyBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.dangerBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    padding: 12,
  },
  safetyTextWrap: {
    flex: 1,
  },
  safetyBold: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.danger,
  },
  safetyDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
    marginTop: 2,
  },
  section: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  catCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 12,
    ...shadows.panel,
  },
  catCardSelected: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  catIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catIconWrapSelected: {
    backgroundColor: colors.danger,
  },
  catTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  catTitleSelected: {
    color: colors.danger,
    fontWeight: '900',
  },
  catDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  evidenceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
    ...shadows.panel,
  },
  evidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  evidenceSub: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 1,
  },
  evidenceBadge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  evidenceBadgeAttached: {
    backgroundColor: colors.successSoft,
  },
  evidenceBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.textMuted,
    fontFamily: typography.fontMono,
  },
  evidenceBadgeTextAttached: {
    color: colors.success,
  },
  openCamBtn: {
    borderColor: colors.primaryBorder,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderRadius: 10,
  },
  cameraBox: {
    backgroundColor: '#000000',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    padding: 12,
    alignItems: 'center',
  },
  camTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  camRecText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#ef4444',
    fontFamily: typography.fontMono,
  },
  camDeviceText: {
    fontSize: 10,
    color: '#94a3b8',
    fontFamily: typography.fontMono,
  },
  camReticle: {
    width: '80%',
    height: 90,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 8,
    marginVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  camCenterLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 1,
    backgroundColor: '#ef4444',
  },
  camReticleText: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  camActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  shutterBtn: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: colors.danger,
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.float,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.successBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.successBorder,
    padding: 10,
  },
  previewIconBox: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewFilename: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  previewMeta: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 2,
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  retakeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
  },
  deletePhotoBtn: {
    padding: 6,
  },
  notesCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
    ...shadows.panel,
  },
  notesInput: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
    color: colors.textPrimary,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#ffffff',
  },
});

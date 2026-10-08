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
import { Button } from '../../shared/components/Button';
import { colors } from '../../shared/theme/colors';

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
}

const CATEGORIES: { id: IncidentCategory; title: string; desc: string; icon: string }[] = [
  {
    id: 'CONTAINER_DAMAGED',
    title: 'Container Damaged / Crushed',
    desc: 'Physical puncture, cracked rim, broken handle, or spilled cargo',
    icon: '📦',
  },
  {
    id: 'BARCODE_UNREADABLE',
    title: 'Barcode / QR Unreadable',
    desc: 'Label missing, scuffed code 128, distorted or smeared print',
    icon: '🏷️',
  },
  {
    id: 'SHELF_BLOCKED',
    title: 'Shelf Location Blocked / Full',
    desc: 'Destination bin occupied, mechanical overhang, or damaged rack slot',
    icon: '🧱',
  },
  {
    id: 'QUANTITY_MISMATCH',
    title: 'Quantity Mismatch / Missing Items',
    desc: 'Piece count inside tote differs from digital WMS packing list',
    icon: '🔢',
  },
  {
    id: 'AMR_PATH_BLOCKED',
    title: 'AMR Path Blocked / Deadlocked',
    desc: 'Aisle corridor obstructed by pallet or vehicle, safety laser tripped',
    icon: '🛑',
  },
];

export function IssueReportingModal({
  visible,
  onClose,
  onSubmit,
  robotCode = 'AMR-01',
}: IssueReportingModalProps) {
  const [selectedCat, setSelectedCat] = useState<IncidentCategory>('CONTAINER_DAMAGED');
  const [notes, setNotes] = useState('');
  const [photoAttached, setPhotoAttached] = useState(false);

  const handleSubmit = () => {
    onSubmit(selectedCat, notes);
    onClose();
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
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Report Exception & Incident</Text>
              <Text style={styles.subtitle}>{robotCode} · Active Task Issue</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.scrollArea}>
            {/* Safety Warning */}
            <View style={styles.safetyBox}>
              <Text style={styles.safetyIcon}>🛡️</Text>
              <View style={styles.safetyTextWrap}>
                <Text style={styles.safetyTitle}>Safety Protocol Active</Text>
                <Text style={styles.safetyDesc}>
                  Submitting this report will place {robotCode} on hold and notify the Shift Supervisor.
                </Text>
              </View>
            </View>

            {/* Category Choices */}
            <Text style={styles.sectionHeading}>1. SELECT INCIDENT CATEGORY</Text>
            <View style={styles.categoryList}>
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCat === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => setSelectedCat(cat.id)}
                    style={[
                      styles.catItem,
                      isSelected && styles.catItemSelected,
                    ]}
                  >
                    <Text style={styles.catIcon}>{cat.icon}</Text>
                    <View style={styles.catInfo}>
                      <Text
                        style={[
                          styles.catTitle,
                          isSelected && styles.catTitleSelected,
                        ]}
                      >
                        {cat.title}
                      </Text>
                      <Text style={styles.catDesc}>{cat.desc}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Notes Input */}
            <Text style={styles.sectionHeading}>2. FIELD OPERATOR NOTES</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Describe physical condition, rack aisle location..."
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
            />

            {/* Photo Attachment Toggle */}
            <Pressable
              onPress={() => setPhotoAttached(!photoAttached)}
              style={styles.photoToggle}
            >
              <Text style={styles.photoIcon}>📷</Text>
              <Text style={styles.photoLabel}>
                {photoAttached ? 'Evidence Photo Attached (IMG_2026_01.jpg)' : 'Attach Photo Evidence'}
              </Text>
              <Text style={styles.photoCheck}>{photoAttached ? '✓' : '+'}</Text>
            </Pressable>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <Button
              label="SUBMIT SAFETY REPORT"
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
    padding: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: '700',
  },
  scrollArea: {
    marginBottom: 12,
  },
  safetyBox: {
    flexDirection: 'row',
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 8,
    marginBottom: 14,
  },
  safetyIcon: {
    fontSize: 16,
  },
  safetyTextWrap: {
    flex: 1,
  },
  safetyTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.danger,
  },
  safetyDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 14,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  categoryList: {
    gap: 6,
    marginBottom: 14,
  },
  catItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    gap: 10,
  },
  catItemSelected: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  catIcon: {
    fontSize: 18,
  },
  catInfo: {
    flex: 1,
  },
  catTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  catTitleSelected: {
    color: colors.danger,
  },
  catDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 1,
  },
  notesInput: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    minHeight: 60,
    marginBottom: 12,
  },
  photoToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    gap: 8,
    marginBottom: 8,
  },
  photoIcon: {
    fontSize: 16,
  },
  photoLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  photoCheck: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary,
  },
  actionRow: {
    paddingTop: 8,
  },
});

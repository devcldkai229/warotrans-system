import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  Check,
  Layers,
  Lock,
  MapPin,
  Sparkles,
  X,
} from 'lucide-react-native';
import { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { ThemeShadows } from '../../shared/theme/shadows';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { typography } from '../../shared/theme/typography';
import { Text } from '../../shared/ui/Text';
import { triggerHaptic } from '../../shared/utils/haptics';
import type {
  AllocatedStorageSlot,
  StorageLocationListItem,
  WarehouseZoneCode,
} from '../../shared/api/warehouseApi';

export interface TargetSlotPickerModalProps {
  visible: boolean;
  containerBarcode: string;
  containerProduct: string;
  activeZone: WarehouseZoneCode;
  storageLocations: StorageLocationListItem[];
  currentAssignment?: AllocatedStorageSlot | null;
  /** Map of `barcode -> AllocatedStorageSlot` for all currently selected containers in the batch */
  batchAssignments: Record<string, AllocatedStorageSlot>;
  onSelectSlot: (slot: AllocatedStorageSlot) => void;
  onClose: () => void;
}

const ZONE_TABS: Array<{ code: WarehouseZoneCode; label: string }> = [
  { code: 'ZONE_A', label: 'Zone A (Pick Racks)' },
  { code: 'ZONE_B', label: 'Zone B (Heavy Reserve)' },
  { code: 'ZONE_D', label: 'Zone D (Bulk Yard)' },
];

export function TargetSlotPickerModal({
  visible,
  containerBarcode,
  containerProduct,
  activeZone,
  storageLocations,
  currentAssignment,
  batchAssignments,
  onSelectSlot,
  onClose,
}: TargetSlotPickerModalProps) {
  const { styles, colors } = useThemedStyles(createStyles);
  const [selectedZoneTab, setSelectedZoneTab] = useState<WarehouseZoneCode>(activeZone);

  React.useEffect(() => {
    if (visible) {
      setSelectedZoneTab(currentAssignment?.zone || activeZone);
    }
  }, [visible, activeZone, currentAssignment]);

  const racksInZone = useMemo(() => {
    return storageLocations.filter((loc) => loc.isActive && loc.zone === selectedZoneTab);
  }, [storageLocations, selectedZoneTab]);

  // Reverse lookup: `"${storageLocationId}:${levelNo}" -> barcode`
  const batchSlotOwnerMap = useMemo(() => {
    const map: Record<string, string> = {};
    Object.entries(batchAssignments).forEach(([barcode, slot]) => {
      if (slot?.storageLocationId && slot?.levelNo) {
        map[`${slot.storageLocationId}:${slot.levelNo}`] = barcode;
      }
    });
    return map;
  }, [batchAssignments]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close slot picker modal"
        />

        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={styles.headerBadgeRow}>
                <View style={styles.toteBadge}>
                  <Text variant="caption" style={styles.toteBadgeText}>
                    {containerBarcode}
                  </Text>
                </View>
                <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
                  {containerProduct}
                </Text>
              </View>
              <Text variant="headline" style={styles.title}>
                Select Target Rack & Shelf Level
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close slot selector"
            >
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Zone Selector Tabs */}
          <View style={styles.zoneTabsRow}>
            {ZONE_TABS.map((tab) => {
              const isSelected = selectedZoneTab === tab.code;
              return (
                <Pressable
                  key={tab.code}
                  onPress={() => {
                    triggerHaptic('tap');
                    setSelectedZoneTab(tab.code);
                  }}
                  style={[styles.zoneTab, isSelected && styles.zoneTabActive]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    variant="caption"
                    style={[styles.zoneTabText, isSelected && styles.zoneTabTextActive]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
              <Text variant="caption" color={colors.textSecondary}>
                Available
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.textPrimary }]} />
              <Text variant="caption" color={colors.textSecondary}>
                Selected for {containerBarcode}
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
              <Text variant="caption" color={colors.textSecondary}>
                In Current Batch
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#9CA3AF' }]} />
              <Text variant="caption" color={colors.textSecondary}>
                Occupied
              </Text>
            </View>
          </View>

          {/* Racks & 3-Level Shelf Matrix */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {racksInZone.map((rack) => {
              const freeCount = rack.shelfSlots.filter((s) => s.status === 'AVAILABLE').length;
              return (
                <View key={rack.id} style={styles.rackCard}>
                  <View style={styles.rackHeader}>
                    <View style={styles.rackTitleRow}>
                      <Layers size={16} color={colors.textPrimary} />
                      <Text variant="bodyMedium" style={styles.rackCode}>
                        {rack.code}
                      </Text>
                      <Text
                        variant="caption"
                        color={colors.textSecondary}
                        numberOfLines={1}
                        style={{ flex: 1 }}
                      >
                        · {rack.name}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.freeBadge,
                        freeCount === 0 && styles.freeBadgeFull,
                      ]}
                    >
                      <Text
                        variant="caption"
                        style={[
                          styles.freeBadgeText,
                          freeCount === 0 && styles.freeBadgeTextFull,
                        ]}
                      >
                        {freeCount === 0 ? 'Full' : `${freeCount} Open`}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.levelsGrid}>
                    {rack.shelfSlots.map((slot) => {
                      const slotKey = `${rack.id}:${slot.levelNo}`;
                      const batchOwner = batchSlotOwnerMap[slotKey];
                      const isThisContainer = batchOwner === containerBarcode;
                      const isOtherInBatch = Boolean(batchOwner && batchOwner !== containerBarcode);
                      const isOccupiedWarehouse =
                        slot.status !== 'AVAILABLE' && !isThisContainer && !isOtherInBatch;

                      return (
                        <Pressable
                          key={slot.levelNo}
                          disabled={isOccupiedWarehouse}
                          onPress={() => {
                            triggerHaptic('tap');
                            onSelectSlot({
                              storageLocationId: rack.id,
                              storageLocationCode: rack.code,
                              storageLocationName: rack.name,
                              endpointId: rack.endpointId,
                              endpointCode: rack.endpointCode,
                              levelNo: slot.levelNo,
                              zone: rack.zone,
                              zoneLabel: rack.zoneLabel,
                              displayLabel: `${rack.code} · Level ${slot.levelNo}`,
                            });
                            onClose();
                          }}
                          style={({ pressed }) => [
                            styles.levelCell,
                            slot.status === 'AVAILABLE' && !batchOwner && styles.levelCellAvailable,
                            isThisContainer && styles.levelCellSelected,
                            isOtherInBatch && styles.levelCellBatchUsed,
                            isOccupiedWarehouse && styles.levelCellOccupied,
                            pressed && !isOccupiedWarehouse && styles.pressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{
                            selected: isThisContainer,
                            disabled: isOccupiedWarehouse,
                          }}
                          accessibilityLabel={`${rack.code} Level ${slot.levelNo}, ${
                            isOccupiedWarehouse
                              ? `Occupied by ${slot.occupiedByBarcode}`
                              : isThisContainer
                              ? `Assigned to ${containerBarcode}`
                              : isOtherInBatch
                              ? `Assigned to ${batchOwner} in current batch`
                              : 'Available'
                          }`}
                        >
                          <View style={styles.levelTopRow}>
                            <Text
                              variant="caption"
                              style={[
                                styles.levelTitle,
                                isThisContainer && { color: '#FFFFFF' },
                                isOccupiedWarehouse && { color: '#9CA3AF' },
                              ]}
                            >
                              Level {slot.levelNo}
                            </Text>
                            {isThisContainer && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                            {isOccupiedWarehouse && <Lock size={12} color="#9CA3AF" />}
                          </View>

                          <Text
                            variant="caption"
                            numberOfLines={1}
                            style={[
                              styles.levelStatusText,
                              slot.status === 'AVAILABLE' && !batchOwner && { color: '#059669' },
                              isThisContainer && { color: '#A7F3D0' },
                              isOtherInBatch && { color: '#B45309' },
                              isOccupiedWarehouse && { color: '#9CA3AF' },
                            ]}
                          >
                            {isThisContainer
                              ? `Assigned · ${containerBarcode}`
                              : isOtherInBatch
                              ? `Swap · ${batchOwner}`
                              : isOccupiedWarehouse
                              ? `Occupied · ${slot.occupiedByBarcode || 'Stored'}`
                              : 'Empty · Select'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '84%',
    paddingBottom: 24,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  toteBadge: {
    backgroundColor: colors.darkAction,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  toteBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontFamily: typography.fontMono,
    fontSize: 11,
  },
  title: {
    fontWeight: '800',
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneTabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: colors.surfaceSubtle,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  zoneTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneTabActive: {
    backgroundColor: colors.darkAction,
    borderColor: colors.darkAction,
  },
  zoneTabText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  zoneTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scrollArea: {
    maxHeight: 440,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  rackCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 10,
  },
  rackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rackTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  rackCode: {
    fontWeight: '800',
    fontFamily: typography.fontMono,
    color: colors.textPrimary,
  },
  freeBadge: {
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.successBorder,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  freeBadgeFull: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  freeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.successText,
  },
  freeBadgeTextFull: {
    color: colors.textMuted,
  },
  levelsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  levelCell: {
    flex: 1,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    padding: 10,
    gap: 4,
    minHeight: 58,
    justifyContent: 'space-between',
  },
  levelCellAvailable: {
    backgroundColor: colors.successBg,
    borderColor: colors.success,
  },
  levelCellSelected: {
    backgroundColor: colors.darkAction,
    borderColor: colors.darkAction,
  },
  levelCellBatchUsed: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warning,
  },
  levelCellOccupied: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    opacity: 0.75,
  },
  levelTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelTitle: {
    fontWeight: '700',
    fontSize: 12,
    color: colors.textPrimary,
  },
  levelStatusText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});

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
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
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
              <View style={[styles.legendDot, { backgroundColor: '#121317' }]} />
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
                      <Layers size={16} color="#121317" />
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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
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
    borderBottomColor: '#E5E7EB',
  },
  headerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  toteBadge: {
    backgroundColor: '#121317',
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
    color: '#121317',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneTabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  zoneTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneTabActive: {
    backgroundColor: '#121317',
    borderColor: '#121317',
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
    borderBottomColor: '#F3F4F6',
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
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
    color: '#121317',
  },
  freeBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  freeBadgeFull: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  freeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  freeBadgeTextFull: {
    color: '#6B7280',
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
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
  },
  levelCellSelected: {
    backgroundColor: '#121317',
    borderColor: '#121317',
  },
  levelCellBatchUsed: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
  },
  levelCellOccupied: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
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
    color: '#121317',
  },
  levelStatusText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});

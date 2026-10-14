import React from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { Box, Layers, Lock, ArrowDownRight, ArrowUpRight } from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { typography } from '../../shared/theme/typography';
import { ContainerSlot } from '../../shared/types/contracts';
import { Text } from '../../shared/ui';
import { JobContainerItem } from './jobData';

interface AmrChassisDeckVisualizerProps {
  containers?: JobContainerItem[];
  slots?: ContainerSlot[];
  targetCode?: string;
  isWaiting?: boolean;
  robotId?: string;
  robotCode?: string;
  onSelectSlot?: (containerCode: string) => void;
}

export function AmrChassisDeckVisualizer({
  containers,
  slots: legacySlots,
  targetCode,
  isWaiting = false,
  robotId = 'AMR-01',
  robotCode,
  onSelectSlot,
}: AmrChassisDeckVisualizerProps) {
  const activeRobot = robotCode || robotId;
  const slotDefinitions = [
    { id: 1, name: 'Tray 1', position: 'Front' },
    { id: 2, name: 'Tray 2', position: 'Mid' },
    { id: 3, name: 'Tray 3', position: 'Rear' },
  ];

  const items =
    containers ||
    legacySlots?.map((s) => ({
      code: s.containerBarcode || '',
      slot: s.slotLabel,
      action: s.action as any,
      location: '',
      product: s.productName || '',
      qty: s.quantity || 0,
    })) ||
    [];

  const loadedCount = items.filter((c) => c.action && c.action !== 'EMPTY' && c.code).length;

  return (
    <View style={styles.container}>
      {/* Deck Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <View style={styles.iconWell}>
            <Layers size={16} color={colors.primary} />
          </View>
          <View>
            <Text variant="headline" style={styles.titleText}>
              {activeRobot} Payload Deck
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              Multi-tote transport configuration
            </Text>
          </View>
        </View>

        <View style={styles.deckCapacityBadge}>
          <Text variant="caption" color={colors.textSecondary} style={styles.capacityText}>
            {loadedCount} / 3 Trays
          </Text>
        </View>
      </View>

      {/* Industrial Flatbed Graphic */}
      <View style={styles.schematicWrapper}>
        <View style={styles.headingTrack}>
          <Text variant="caption" color={colors.textSecondary} style={styles.headingText}>
            ▲ Forward Heading
          </Text>
        </View>

        <View style={styles.trayStack}>
          {slotDefinitions.map((s) => {
            const matchingContainer = items.find((c) => c.slot.includes(String(s.id)));
            const isUnload = matchingContainer?.action === 'UNLOAD';
            const isPickup = matchingContainer?.action === 'PICKUP';
            const isTarget = isWaiting && (isUnload || matchingContainer?.code === targetCode);
            const isKeep =
              matchingContainer?.action === 'KEEP ONBOARD' ||
              matchingContainer?.action === 'KEEP_ONBOARD' ||
              (!isTarget && matchingContainer && !isPickup);

            return (
              <Pressable
                key={s.id}
                onPress={() => {
                  if (matchingContainer?.code && onSelectSlot) {
                    onSelectSlot(matchingContainer.code);
                  }
                }}
                disabled={!matchingContainer?.code || !onSelectSlot}
                style={({ pressed }) => [
                  styles.trayCard,
                  isTarget && styles.trayCardTarget,
                  isKeep && styles.trayCardKeep,
                  !matchingContainer && styles.trayCardEmpty,
                  pressed && styles.trayPressed,
                ]}
              >
                {/* Left position indicator */}
                <View style={styles.trayPositionCol}>
                  <Text
                    variant="caption"
                    color={isTarget ? colors.primaryText : colors.textMuted}
                    style={styles.trayPositionNum}
                  >
                    0{s.id}
                  </Text>
                  <Text variant="caption" color={colors.textMuted} style={styles.trayPositionLabel}>
                    {s.position}
                  </Text>
                </View>

                {/* Content */}
                {matchingContainer && matchingContainer.code ? (
                  <View style={styles.trayContent}>
                    <View style={styles.trayCodeRow}>
                      <Text
                        variant="bodyMedium"
                        style={[styles.trayCodeText, isTarget && styles.trayCodeTextTarget]}
                        numberOfLines={1}
                      >
                        {matchingContainer.code}
                      </Text>
                      {isTarget ? (
                        <View style={styles.targetActionBadge}>
                          <ArrowDownRight size={12} color="#ffffff" style={{ marginRight: 4 }} />
                          <Text variant="caption" style={styles.targetActionBadgeText}>
                            Unload Target
                          </Text>
                        </View>
                      ) : isPickup ? (
                        <View style={styles.pickupActionBadge}>
                          <ArrowUpRight size={12} color="#ffffff" style={{ marginRight: 4 }} />
                          <Text variant="caption" style={styles.targetActionBadgeText}>
                            Pickup
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.keepActionBadge}>
                          <Lock size={11} color={colors.textMuted} style={{ marginRight: 4 }} />
                          <Text variant="caption" color={colors.textSecondary} style={styles.keepActionText}>
                            Keep Onboard
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
                      <Text style={styles.boldQty}>{matchingContainer.qty} pcs</Text> · {matchingContainer.product || 'Standard Tote'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.trayContentEmpty}>
                    <Text variant="caption" color={colors.textMuted}>
                      Empty Slot · Ready for load
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    fontWeight: '700',
  },
  deckCapacityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  capacityText: {
    fontWeight: '600',
  },
  schematicWrapper: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  headingTrack: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  headingText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  trayStack: {
    gap: 8,
  },
  trayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  trayCardTarget: {
    borderColor: colors.darkAction,
    borderWidth: 1.5,
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  trayCardKeep: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
  },
  trayCardEmpty: {
    backgroundColor: colors.surface,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  trayPressed: {
    opacity: 0.85,
  },
  trayPositionCol: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingRight: 8,
  },
  trayPositionNum: {
    fontWeight: '700',
    fontSize: 13,
  },
  trayPositionLabel: {
    fontSize: 11,
  },
  trayContent: {
    flex: 1,
    gap: 4,
  },
  trayContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  trayCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  trayCodeText: {
    fontWeight: '700',
    fontFamily: typography.fontMono,
    flex: 1,
  },
  boldQty: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  trayCodeTextTarget: {
    color: colors.textPrimary,
  },
  targetActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.darkAction,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  targetActionBadgeText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 11,
  },
  pickupActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  keepActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  keepActionText: {
    fontWeight: '600',
    fontSize: 11,
  },
});

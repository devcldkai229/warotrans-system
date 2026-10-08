import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../../shared/theme/colors';
import { ContainerSlot } from '../../shared/types/contracts';

interface ContainerSlotCardProps {
  slot: ContainerSlot;
  onVerifyPress?: () => void;
}

export function ContainerSlotCard({ slot, onVerifyPress }: ContainerSlotCardProps) {
  const isUnload = slot.action === 'UNLOAD';
  const isPickup = slot.action === 'PICKUP';
  const isKeep = slot.action === 'KEEP_ONBOARD';

  return (
    <View
      style={[
        styles.card,
        isUnload && styles.cardUnload,
        isPickup && styles.cardPickup,
        isKeep && styles.cardKeep,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.actionBadge,
              isUnload && styles.badgeUnload,
              isPickup && styles.badgePickup,
            ]}
          >
            <Text
              style={[
                styles.actionBadgeText,
                (isUnload || isPickup) && styles.badgeTextActive,
              ]}
            >
              {isUnload ? 'UNLOAD HERE' : isPickup ? 'PICKUP HERE' : slot.action}
            </Text>
          </View>
          <Text style={styles.slotLabel}>{slot.slotLabel}</Text>
        </View>

        <Text style={styles.statusIndicator}>
          {isUnload ? 'Active Stop' : isPickup ? 'Target Stop' : 'Passive'}
        </Text>
      </View>

      <View style={styles.mainInfoRow}>
        <View style={styles.textCol}>
          <Text style={styles.barcode}>{slot.containerBarcode || 'N/A'}</Text>
          <Text style={styles.productName}>{slot.productName || 'Empty Container'}</Text>
          {slot.quantity !== undefined && (
            <Text style={styles.qtyText}>{slot.quantity} units onboard</Text>
          )}
        </View>

        {(isUnload || isPickup) && onVerifyPress && (
          <Pressable
            onPress={onVerifyPress}
            style={({ pressed }) => [
              styles.verifyBtn,
              pressed && styles.verifyBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Verify container ${slot.containerBarcode}`}
          >
            <Text style={styles.verifyBtnText}>📷 Verify</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  cardUnload: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  cardPickup: {
    borderColor: colors.warning,
    backgroundColor: colors.warningBg,
  },
  cardKeep: {
    backgroundColor: colors.surfaceSubtle,
    opacity: 0.9,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.surfaceMuted,
  },
  badgeUnload: {
    backgroundColor: colors.primary,
  },
  badgePickup: {
    backgroundColor: colors.warning,
  },
  actionBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.textSecondary,
  },
  badgeTextActive: {
    color: colors.textInverse,
  },
  slotLabel: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.textSecondary,
  },
  statusIndicator: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
  },
  mainInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  textCol: {
    flex: 1,
  },
  barcode: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  productName: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 2,
  },
  qtyText: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  verifyBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  verifyBtnPressed: {
    backgroundColor: colors.primaryDark,
  },
  verifyBtnText: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: '800',
  },
});

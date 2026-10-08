import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../shared/theme/colors';
import { ContainerSlot } from '../../shared/types/contracts';

interface AmrChassisDeckVisualizerProps {
  slots: ContainerSlot[];
  robotCode?: string;
}

export function AmrChassisDeckVisualizer({
  slots,
  robotCode = 'AMR-01',
}: AmrChassisDeckVisualizerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>FLATBED DECK CHASSIS MAP</Text>
          <Text style={styles.robotCode}>{robotCode}</Text>
        </View>
        <Text style={styles.directionIndicator}>▲ TRAVEL FORWARD</Text>
      </View>

      <View style={styles.chassisBody}>
        {slots.map((slot) => {
          const isFilled = slot.action !== 'EMPTY';
          const isUnload = slot.action === 'UNLOAD';
          const isPickup = slot.action === 'PICKUP';

          return (
            <View
              key={slot.slotNo}
              style={[
                styles.slotTray,
                isFilled && styles.slotTrayFilled,
                isUnload && styles.slotTrayUnload,
                isPickup && styles.slotTrayPickup,
              ]}
            >
              <View style={styles.slotTopRow}>
                <View style={styles.slotLabelGroup}>
                  {(isUnload || isPickup) && (
                    <View style={[styles.ledDot, isUnload ? styles.ledDotBlue : styles.ledDotAmber]} />
                  )}
                  <Text style={styles.slotLabelText}>{slot.slotLabel}</Text>
                </View>
                <View
                  style={[
                    styles.actionTag,
                    isUnload && styles.tagUnload,
                    isPickup && styles.tagPickup,
                  ]}
                >
                  <Text
                    style={[
                      styles.actionTagText,
                      isUnload && styles.textUnload,
                      isPickup && styles.textPickup,
                    ]}
                  >
                    {slot.action}
                  </Text>
                </View>
              </View>

              {isFilled ? (
                <View style={styles.slotCargo}>
                  <Text style={styles.cargoBarcode}>{slot.containerBarcode}</Text>
                  <Text style={styles.cargoProduct} numberOfLines={1}>
                    {slot.productName}
                  </Text>
                  {slot.quantity !== undefined && (
                    <Text style={styles.cargoQty}>{slot.quantity} units</Text>
                  )}
                </View>
              ) : (
                <View style={styles.emptySlotWrap}>
                  <Text style={styles.emptySlotText}>[ Empty Slot ]</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Pick-to-Light Physical Deck Guidance */}
      <View style={styles.ptlGuidance}>
        <View style={styles.ptlLedPulse} />
        <Text style={styles.ptlText}>
          <Text style={styles.ptlBold}>Pick-to-Light Active: </Text>
          Target slot illuminated on AMR physical deck during handover.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
    paddingBottom: 6,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textSecondary,
  },
  robotCode: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.primary,
  },
  directionIndicator: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  chassisBody: {
    flexDirection: 'row',
    gap: 8,
  },
  slotTray: {
    flex: 1,
    minHeight: 110,
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    padding: 8,
    justifyContent: 'space-between',
  },
  slotTrayFilled: {
    borderStyle: 'solid',
    borderColor: colors.borderDark,
    backgroundColor: colors.surface,
  },
  slotTrayUnload: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  slotTrayPickup: {
    borderColor: colors.warning,
    backgroundColor: colors.warningBg,
  },
  slotTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slotLabelText: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.textMuted,
  },
  actionTag: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: colors.surfaceMuted,
  },
  tagUnload: {
    backgroundColor: colors.primary,
  },
  tagPickup: {
    backgroundColor: colors.warning,
  },
  actionTagText: {
    fontSize: 7,
    fontWeight: '900',
    color: colors.textSecondary,
  },
  textUnload: {
    color: colors.textInverse,
  },
  textPickup: {
    color: colors.textInverse,
  },
  slotCargo: {
    marginTop: 4,
  },
  cargoBarcode: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  cargoProduct: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 1,
  },
  cargoQty: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 2,
  },
  emptySlotWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  emptySlotText: {
    fontSize: 9,
    fontStyle: 'italic',
    color: colors.textMuted,
  },
  slotLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ledDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ledDotBlue: {
    backgroundColor: '#0284c7',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 3,
    elevation: 2,
  },
  ledDotAmber: {
    backgroundColor: '#f59e0b',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 3,
    elevation: 2,
  },
  ptlGuidance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceSubtle,
  },
  ptlLedPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0284c7',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
  },
  ptlText: {
    fontSize: 9,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 13,
  },
  ptlBold: {
    fontWeight: '800',
    color: colors.primary,
  },
});

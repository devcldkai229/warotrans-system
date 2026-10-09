import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Box, Layers } from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { typography } from '../../shared/theme/typography';
import { ContainerSlot } from '../../shared/types/contracts';

interface AmrChassisDeckVisualizerProps {
  slots: ContainerSlot[];
  robotCode?: string;
}

export function AmrChassisDeckVisualizer({
  slots,
  robotCode = 'AMR-01',
}: AmrChassisDeckVisualizerProps) {
  const filledCount = slots.filter((s) => s.action !== 'EMPTY').length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <View style={styles.iconWrap}>
            <Layers size={14} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.title}>
              {robotCode} Flatbed Chassis · 3-Tray Deck
            </Text>
            <Text style={styles.subTitle}>Top-Down Physical Tray Arrangement</Text>
          </View>
        </View>
        <View style={styles.slotsBadge}>
          <Text style={styles.slotsBadgeText}>{filledCount}/3 SLOTS</Text>
        </View>
      </View>

      {/* Industrial AMR Chassis Schematic Graphic */}
      <View style={styles.schematicWrapper}>
        {/* Drive Wheels */}
        <View style={styles.wheelLeft} />
        <View style={styles.wheelRight} />

        {/* Heading Indicator Arrow */}
        <View style={styles.headingIndicator}>
          <Text style={styles.headingIndicatorText}>▲ FRONT (NAV2 HEADING DIRECTION)</Text>
        </View>

        {/* 3 Physical Tray Bays */}
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
                </View>

                {isFilled ? (
                  <View style={styles.slotCargo}>
                    <View style={styles.boxIconWrap}>
                      <Box size={13} color={isUnload ? colors.primary : colors.textSecondary} />
                    </View>
                    <Text style={[styles.cargoBarcode, isUnload && styles.cargoBarcodeUnload]} numberOfLines={1}>
                      {slot.containerBarcode}
                    </Text>
                    {slot.quantity !== undefined && (
                      <Text style={styles.cargoQty}>{slot.quantity} pcs</Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.emptySlotWrap}>
                    <Text style={styles.emptySlotText}>EMPTY TRAY</Text>
                  </View>
                )}

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
                    {isUnload ? 'UNLOAD' : isPickup ? 'PICKUP' : slot.action}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Pick-to-Light Physical Deck Guidance */}
      <View style={styles.ptlGuidance}>
        <View style={styles.ptlLedPulse} />
        <Text style={styles.ptlText}>
          <Text style={styles.ptlBold}>Pick-to-Light: </Text>
          Operator retrieves tote directly from illuminated tray slot during handover.
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
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
    paddingBottom: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 92, 209, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: colors.textPrimary,
    textTransform: 'uppercase',
  },
  subTitle: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 1,
  },
  slotsBadge: {
    backgroundColor: 'rgba(0, 92, 209, 0.08)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 92, 209, 0.2)',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  slotsBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: typography.fontMono,
    color: colors.primary,
  },
  schematicWrapper: {
    position: 'relative',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 92, 209, 0.35)',
    backgroundColor: colors.surfaceSubtle,
    padding: 10,
    marginVertical: 4,
  },
  wheelLeft: {
    position: 'absolute',
    left: -4,
    top: '50%',
    marginTop: -16,
    width: 5,
    height: 32,
    borderRadius: 2.5,
    backgroundColor: '#334155',
  },
  wheelRight: {
    position: 'absolute',
    right: -4,
    top: '50%',
    marginTop: -16,
    width: 5,
    height: 32,
    borderRadius: 2.5,
    backgroundColor: '#334155',
  },
  headingIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  headingIndicatorText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: colors.primary,
    fontFamily: typography.fontMono,
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
    alignItems: 'center',
    width: '100%',
  },
  boxIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 92, 209, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  cargoBarcode: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: typography.fontMono,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  cargoBarcodeUnload: {
    color: colors.primary,
  },
  cargoProduct: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 1,
    textAlign: 'center',
  },
  cargoQty: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 1,
    textAlign: 'center',
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

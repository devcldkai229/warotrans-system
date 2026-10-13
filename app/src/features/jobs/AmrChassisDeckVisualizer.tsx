import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { Box, Layers } from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { typography } from '../../shared/theme/typography';
import { ContainerSlot } from '../../shared/types/contracts';
import { JobContainerItem } from './jobData';

function TargetTrayPulseWrapper({
  isTarget,
  children,
  style,
}: {
  isTarget: boolean;
  children: React.ReactNode;
  style: any;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isTarget) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.58,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isTarget, pulseAnim]);

  if (!isTarget) {
    return <View style={style}>{children}</View>;
  }

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: pulseAnim,
        },
        Platform.OS === 'web' ? ({ className: 'animate-pulse' } as any) : undefined,
      ]}
    >
      {children}
    </Animated.View>
  );
}

interface AmrChassisDeckVisualizerProps {
  containers?: JobContainerItem[];
  slots?: ContainerSlot[];
  targetCode?: string;
  isWaiting?: boolean;
  robotId?: string;
  robotCode?: string;
}

export function AmrChassisDeckVisualizer({
  containers,
  slots: legacySlots,
  targetCode,
  isWaiting = false,
  robotId = 'AMR-01',
  robotCode,
}: AmrChassisDeckVisualizerProps) {
  const activeRobot = robotCode || robotId;
  const slotDefinitions = [
    { id: 1, name: 'Slot 1 (Front)', label: 'TRAY 1 · FRONT' },
    { id: 2, name: 'Slot 2 (Mid)', label: 'TRAY 2 · MID' },
    { id: 3, name: 'Slot 3 (Rear)', label: 'TRAY 3 · REAR' },
  ];

  const items = containers || (legacySlots?.map(s => ({
    code: s.containerBarcode || '',
    slot: s.slotLabel,
    action: s.action as any,
    location: '',
    product: s.productName || '',
    qty: s.quantity || 0,
  }))) || [];

  const filledCount = items.filter(c => c.action && c.action !== 'EMPTY' && c.code).length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <View style={styles.iconWrap}>
            <Layers size={15} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.title}>
              {activeRobot} Flatbed Chassis · 3-Tray Deck
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
          {slotDefinitions.map((s) => {
            const matchingContainer = items.find((c) => c.slot.includes(String(s.id)));
            const isUnload = matchingContainer?.action === 'UNLOAD';
            const isPickup = matchingContainer?.action === 'PICKUP';
            const isKeep = matchingContainer?.action === 'KEEP ONBOARD' || matchingContainer?.action === 'KEEP_ONBOARD';
            const isTarget = isWaiting && isUnload;

            return (
              <TargetTrayPulseWrapper
                isTarget={Boolean(isTarget)}
                key={s.id}
                style={[
                  styles.slotTray,
                  isTarget && styles.slotTrayTarget,
                  matchingContainer && !isTarget && styles.slotTrayFilled,
                  !matchingContainer && styles.slotTrayEmpty,
                ]}
              >
                <Text style={styles.slotLabelText}>{s.label}</Text>

                {matchingContainer && matchingContainer.code ? (
                  <View style={styles.slotCargo}>
                    <View style={styles.boxIconWrap}>
                      <Box size={14} color={colors.primary} />
                    </View>
                    <Text
                      style={[
                        styles.cargoBarcode,
                        isTarget && styles.cargoBarcodeTarget,
                      ]}
                      numberOfLines={1}
                    >
                      {matchingContainer.code}
                    </Text>
                    <Text style={styles.cargoQty} numberOfLines={1}>
                      {matchingContainer.qty} pcs
                    </Text>
                  </View>
                ) : (
                  <View style={styles.emptySlotWrap}>
                    <Text style={styles.emptySlotText}>EMPTY TRAY</Text>
                  </View>
                )}

                <View
                  style={[
                    styles.actionTag,
                    isTarget
                      ? styles.tagTarget
                      : isUnload
                      ? styles.tagUnload
                      : isPickup
                      ? styles.tagPickup
                      : isKeep
                      ? styles.tagKeep
                      : styles.tagEmpty,
                  ]}
                >
                  <Text
                    style={[
                      styles.actionTagText,
                      isTarget
                        ? styles.textTarget
                        : isUnload
                        ? styles.textUnload
                        : isPickup
                        ? styles.textPickup
                        : isKeep
                        ? styles.textKeep
                        : styles.textEmpty,
                    ]}
                  >
                    {isTarget ? 'UNLOAD HERE' : matchingContainer ? matchingContainer.action : 'EMPTY'}
                  </Text>
                </View>
              </TargetTrayPulseWrapper>
            );
          })}
        </View>
      </View>

      {/* Pick-to-Light Deck Footnote */}
      <Text style={styles.ptlFootnote}>
        Pick-to-Light: Operator retrieves tote directly from illuminated tray slot during handover.
      </Text>
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
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10,
    marginBottom: 12,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 102, 204, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    textTransform: 'uppercase',
  },
  subTitle: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
  slotsBadge: {
    backgroundColor: 'rgba(0, 102, 204, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 204, 0.2)',
  },
  slotsBadgeText: {
    fontFamily: typography.fontMono,
    fontSize: 9,
    fontWeight: '900',
    color: colors.primary,
  },
  schematicWrapper: {
    backgroundColor: 'rgba(241, 245, 249, 0.5)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(0, 102, 204, 0.3)',
    padding: 12,
    position: 'relative',
    marginHorizontal: 4,
  },
  wheelLeft: {
    position: 'absolute',
    left: -3,
    top: '50%',
    marginTop: -16,
    width: 4,
    height: 32,
    borderRadius: 99,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
  },
  wheelRight: {
    position: 'absolute',
    right: -3,
    top: '50%',
    marginTop: -16,
    width: 4,
    height: 32,
    borderRadius: 99,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
  },
  headingIndicator: {
    alignItems: 'center',
    marginBottom: 8,
  },
  headingIndicatorText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: colors.primary,
  },
  chassisBody: {
    flexDirection: 'row',
    gap: 8,
  },
  slotTray: {
    flex: 1,
    minHeight: 100,
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  slotTrayTarget: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: 'rgba(0, 92, 209, 0.15)',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  slotTrayFilled: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  slotTrayEmpty: {
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: 'rgba(241, 245, 249, 0.3)',
  },
  slotLabelText: {
    fontFamily: typography.fontMono,
    fontSize: 8,
    fontWeight: '900',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  slotCargo: {
    alignItems: 'center',
    marginVertical: 4,
    width: '100%',
  },
  boxIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 102, 204, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cargoBarcode: {
    fontFamily: typography.fontMono,
    fontSize: 11,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  cargoBarcodeTarget: {
    color: colors.primary,
  },
  cargoQty: {
    fontSize: 9,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 1,
  },
  emptySlotWrap: {
    marginVertical: 12,
    alignItems: 'center',
  },
  emptySlotText: {
    fontFamily: typography.fontMono,
    fontSize: 9,
    color: colors.textMuted,
  },
  actionTag: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 'auto',
  },
  tagTarget: {
    backgroundColor: colors.primary,
  },
  tagUnload: {
    backgroundColor: 'rgba(0, 102, 204, 0.15)',
  },
  tagPickup: {
    backgroundColor: '#fef3c7',
  },
  tagKeep: {
    backgroundColor: '#f1f5f9',
  },
  tagEmpty: {
    backgroundColor: 'rgba(241, 245, 249, 0.4)',
  },
  actionTagText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  textTarget: {
    color: '#ffffff',
  },
  textUnload: {
    color: colors.primary,
  },
  textPickup: {
    color: '#92400e',
  },
  textKeep: {
    color: '#64748b',
  },
  textEmpty: {
    color: '#94a3b8',
  },
  ptlFootnote: {
    fontSize: 9,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 13,
  },
});

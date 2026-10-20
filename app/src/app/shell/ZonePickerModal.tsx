import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Check, MapPin } from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { useTopInset } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { Text } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';

/** The zones an operator can be assigned to for the current shift. */
export const WORK_ZONE_OPTIONS = [
  'Inbound Dock 01',
  'Storage Zone A (Racks A01-A12)',
  'Storage Zone B (Racks B01-B08)',
  'Outbound Shipping Bay 01',
] as const;

export interface ZonePickerModalProps {
  visible: boolean;
  /** The zone currently in force, shown as the selected item. */
  zone: string;
  onClose: () => void;
  onSelect: (zone: string) => void;
}

/**
 * Anchored Work Zone Dropdown Menu.
 *
 * Drops down cleanly right beneath the header zone pill with an ultra-lightweight,
 * transparent dismiss layer instead of a heavy centered screen modal.
 */
export function ZonePickerModal({
  visible,
  zone,
  onClose,
  onSelect,
}: ZonePickerModalProps) {
  const topInset = useTopInset();

  const handleSelect = (option: string) => {
    triggerHaptic('tap');
    onSelect(option);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close work zone menu"
        />

        <View style={[styles.dropdownCard, { top: topInset + 50 }]}>
          <View style={styles.cardHeader}>
            <MapPin size={14} color={colors.primary} />
            <Text variant="caption" color={colors.textSecondary} style={styles.headerLabel}>
              Select Work Zone
            </Text>
          </View>

          <View style={styles.list} accessibilityRole="radiogroup">
            {WORK_ZONE_OPTIONS.map((option, idx) => {
              const isSelected = option === zone;
              return (
                <React.Fragment key={option}>
                  {idx > 0 && <View style={styles.separator} />}
                  <Pressable
                    onPress={() => handleSelect(option)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={option}
                    style={({ pressed }) => [
                      styles.option,
                      isSelected && styles.optionSelected,
                      pressed && !isSelected && styles.optionPressed,
                    ]}
                  >
                    <Text
                      variant="bodyMedium"
                      color={isSelected ? colors.primaryText : colors.textPrimary}
                      numberOfLines={1}
                      style={[styles.optionText, isSelected && styles.optionTextSelected]}
                    >
                      {option}
                    </Text>
                    {isSelected && (
                      <Check size={16} color={colors.primary} strokeWidth={2.4} />
                    )}
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  dropdownCard: {
    position: 'absolute',
    left: 16,
    width: 290,
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    ...shadows.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    marginBottom: 4,
  },
  headerLabel: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  list: {
    gap: 1,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginHorizontal: 6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: radii.sm,
  },
  optionSelected: {
    backgroundColor: colors.primaryLight,
  },
  optionPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
    fontWeight: '400',
  },
  optionTextSelected: {
    fontWeight: '600',
  },
});
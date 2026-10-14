import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { Text } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import { SheetDialog } from './SheetDialog';

/** The zones an operator can be assigned to for the current shift. */
export const WORK_ZONE_OPTIONS = [
  'Inbound Dock 01',
  'Storage Zone A (Racks A01-A12)',
  'Storage Zone B (Racks B01-B08)',
  'Outbound Shipping Bay 01',
] as const;

export interface ZonePickerModalProps {
  visible: boolean;
  /** The zone currently in force, shown as the selected radio. */
  zone: string;
  onClose: () => void;
  onSelect: (zone: string) => void;
}

/**
 * Shift work-zone picker.
 *
 * A radio group rather than a menu: the operator is choosing *where they are
 * working for the next hours*, not firing an action, and a single-select control
 * that always shows the current answer is one they never have to learn.
 */
export function ZonePickerModal({
  visible,
  zone,
  onClose,
  onSelect,
}: ZonePickerModalProps) {
  const handleSelect = (option: string) => {
    triggerHaptic('tap');
    onSelect(option);
  };

  return (
    <SheetDialog visible={visible} onClose={onClose} closeLabel="Close zone picker">
      <Text variant="title">Select work zone</Text>
      <Text variant="caption" color={colors.textSecondary} style={styles.hint}>
        Jobs and telemetry are filtered to the selected zone for this shift.
      </Text>

      <View style={styles.list}>
        {WORK_ZONE_OPTIONS.map((option) => {
          const isSelected = option === zone;
          return (
            <Pressable
              key={option}
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
              <View style={[styles.radio, isSelected && styles.radioSelected]}>
                {isSelected ? <View style={styles.radioDot} /> : null}
              </View>
              <Text
                variant="body"
                color={isSelected ? colors.primaryText : colors.textPrimary}
                numberOfLines={2}
                style={styles.optionText}
              >
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SheetDialog>
  );
}

const styles = StyleSheet.create({
  hint: {
    marginTop: -4,
  },
  list: {
    marginTop: 6,
    gap: 6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryBorder,
  },
  optionPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
});
import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { radii } from '../theme/radii';
import { shadows } from '../theme/shadows';
import { Text } from './Text';

export interface SegmentedControlOption<TValue extends string = string> {
  label: string;
  value: TValue;
}

export interface SegmentedControlProps<TValue extends string = string> {
  options: ReadonlyArray<SegmentedControlOption<TValue>>;
  value: TValue;
  onChange: (value: TValue) => void;
  size?: 'sm' | 'md';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Tab bar for switching a view in place (My Jobs / Global Pool / History).
 *
 * Every segment is `flex: 1`, so the control always fills its container and the
 * labels stay centred no matter how uneven the text lengths are. The active
 * segment is a white card lifted one shadow step above a slate track — the
 * Apple/Linear pattern — rather than a sliding underline, which is easy to miss
 * on a bright warehouse floor.
 *
 * Controlled: the parent owns the value, so a screen can veto a switch (an
 * unsaved form) simply by not calling `onChange`.
 */
export function SegmentedControl<TValue extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
  accessibilityLabel,
  style,
}: SegmentedControlProps<TValue>) {
  const isSm = size === 'sm';

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, isSm ? styles.trackSm : styles.trackMd, style]}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={option.label}
            /**
             * `hitSlop` only exists for `sm`, where the caller has squeezed the
             * control into a filter strip. `md` is already at the 44pt floor.
             */
            hitSlop={isSm ? { top: 6, bottom: 6 } : undefined}
            style={({ pressed }) => [
              styles.segment,
              isActive && styles.segmentActive,
              pressed && !isActive && styles.segmentPressed,
            ]}
          >
            <Text
              variant={isSm ? 'caption' : 'label'}
              color={isActive ? colors.textPrimary : colors.textSecondary}
              numberOfLines={1}
              style={[styles.label, isActive ? styles.labelActive : null]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trackSm: {
    padding: 3,
  },
  trackMd: {
    // The track is a floor, not a fixed height: 44pt segment + 2x4pt padding +
    // the 1px border lands at 54pt, which is what the Jobs filter bar wants.
    // `minHeight` only has to guarantee the control is never smaller than the
    // 48pt touch target if a future caller compresses it.
    minHeight: 48,
    padding: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // `minWidth: 0` + `flexShrink: 1` on the label are what let a long segment
    // ("My Tasks (12)") ellipsize instead of forcing the track to overflow —
    // without them the widest label sets the width of all three segments.
    // 44pt is the touch floor (iOS HIG / Material), not a visual size: the
    // segment is the whole target here, so it cannot lean on `hitSlop`.
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  segmentPressed: {
    opacity: 0.6,
  },
  label: {
    flexShrink: 1,
    minWidth: 0,
  },
  labelActive: {
    fontWeight: '600',
  },
});
import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { translateText } from '../i18n';
import { ThemeShadows } from '../theme/shadows';
import { useThemedStyles } from '../theme/ThemeContext';
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
  const { styles, colors } = useThemedStyles(createStyles);
  const isSm = size === 'sm';

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel ? translateText(accessibilityLabel) : undefined}
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
            accessibilityLabel={translateText(option.label)}
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

const createStyles = (_colors: ThemeColors, _shadows: ThemeShadows, isDark: boolean) =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      alignSelf: 'stretch',
      backgroundColor: isDark ? 'rgba(118, 118, 128, 0.24)' : 'rgba(118, 118, 128, 0.11)',
      borderRadius: 10,
      borderCurve: 'continuous',
      gap: 2,
    },
    trackSm: {
      padding: 3,
    },
    trackMd: {
      minHeight: 48,
      padding: 4,
    },
    segment: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      minWidth: 0,
      paddingHorizontal: 8,
      borderRadius: 8,
      borderCurve: 'continuous',
    },
    segmentActive: {
      backgroundColor: isDark ? '#3a3b40' : '#ffffff',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.04)',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.28 : 0.08,
      shadowRadius: 3,
      elevation: 1,
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
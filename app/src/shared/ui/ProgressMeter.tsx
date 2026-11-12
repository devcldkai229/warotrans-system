import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SemanticTone, ThemeColors } from '../theme/colors';
import { radii } from '../theme/radii';
import { useThemeColors } from '../theme/ThemeContext';

/** `primary` is the default fill; the semantic tones drive status meters. */
export type MeterTone = 'primary' | SemanticTone;

export interface ProgressMeterProps {
  /** Completion in percent. Clamped to 0-100 so a bad DTO cannot overflow the track. */
  value: number;
  /** Fill tone. `primary` unless the meter is reporting battery or a hold. */
  tone?: MeterTone;
  /** Track (unfilled) colour. Defaults to `surfaceMuted`. */
  trackColor?: string;
  /** Bar thickness. 4pt by default — a meter, not a progress dialog. */
  height?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

function getToneFill(colors: ThemeColors): Record<MeterTone, string> {
  return {
    primary: colors.primary,
    neutral: colors.textMuted,
    info: colors.info,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
  };
}

export function ProgressMeter({
  value,
  tone = 'primary',
  trackColor,
  height = 4,
  accessibilityLabel,
  style,
}: ProgressMeterProps) {
  const colors = useThemeColors();
  const resolvedTrackColor = trackColor ?? colors.surfaceMuted;
  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
      style={[
        styles.track,
        { height, backgroundColor: resolvedTrackColor },
        style,
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${clamped}%`,
            backgroundColor: getToneFill(colors)[tone],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
  },
});
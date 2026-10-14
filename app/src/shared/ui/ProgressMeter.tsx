import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, SemanticTone } from '../theme/colors';
import { radii } from '../theme/radii';

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

/** Fill colour per tone. The tone's `*` token, not `*Text`: this is a graphic. */
const TONE_FILL: Record<MeterTone, string> = {
  primary: colors.primary,
  neutral: colors.textMuted,
  info: colors.info,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
};

/**
 * Thin horizontal meter — handover progress, battery charge, route completion.
 *
 * Exists as a primitive because every one of those is the same 4pt bar and three
 * screens had grown three subtly different copies of it. The fill is a plain
 * `View` with a percentage width rather than an SVG or an animated driver: at
 * 4pt, over a handful of cards, an animation costs a frame budget and buys
 * nothing an operator can read at arm's length.
 */
export function ProgressMeter({
  value,
  tone = 'primary',
  trackColor = colors.surfaceMuted,
  height = 4,
  accessibilityLabel,
  style,
}: ProgressMeterProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
      style={[
        styles.track,
        { height, backgroundColor: trackColor },
        style,
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${clamped}%`,
            backgroundColor: TONE_FILL[tone],
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
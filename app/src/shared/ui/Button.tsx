import { LucideIcon } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '../theme/colors';
import { radii } from '../theme/radii';
import { Text, TextColor } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  /** The action, as a verb: "Start Handover", "Report Exception". */
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Lucide icon component, e.g. `Play` from `lucide-react-native`. */
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  disabled?: boolean;
  loading?: boolean;
  /** Stretch to the container width. Use for the single primary action on a screen. */
  fullWidth?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

/**
 * The app's action control.
 *
 * Flat by design: a 1px hairline (or no border at all) plus one soft shadow
 * step. The old bevelled bottom edge is gone — a bevel reads as "physical key"
 * and fights the calmer surface language.
 *
 * Touch targets: 44pt at `size="sm"`, 48pt at `size="md"` — the size every
 * primary action uses — and 52pt at `size="lg"`, so a primary CTA is
 * comfortably hittable one-handed on a PDA without looking down.
 *
 * `loading` keeps the label in place and swaps the icon for a spinner: a button
 * that changes width mid-tap makes the operator re-aim their thumb.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityLabel,
  style,
  textStyle,
}: ButtonProps) {
  const isInteractive = !disabled && !loading;
  const tone = TONE[variant];
  const metrics = SIZE_METRICS[size];
  const IconCmp = Icon;
  const iconSize = metrics.icon;

  const iconNode = loading ? (
    <ActivityIndicator size="small" color={tone.text} />
  ) : IconCmp ? (
    <View style={variant === 'primary' ? styles.primaryIconWell : undefined}>
      <IconCmp size={variant === 'primary' ? iconSize - 2 : iconSize} color={tone.text} strokeWidth={2.4} />
    </View>
  ) : null;

  return (
    <Pressable
      onPress={isInteractive ? onPress : undefined}
      disabled={!isInteractive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        tone.container,
        sizeStyles[size],
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        pressed && isInteractive && styles.pressed,
        style,
      ]}
    >
      <View style={[styles.row, metrics.rowGap]}>
        {iconNode && iconPosition === 'left' ? <View style={styles.slot}>{iconNode}</View> : null}
        <Text
          variant={metrics.variant}
          color={disabled ? colors.textMuted : tone.text}
          textAlign="center"
          style={[styles.label, textStyle]}
        >
          {title}
        </Text>
        {iconNode && iconPosition === 'right' ? <View style={styles.slot}>{iconNode}</View> : null}
      </View>
    </Pressable>
  );
}

/** Per-variant container + foreground. Kept in one table so they cannot drift. */
const TONE: Record<ButtonVariant, { container: ViewStyle; text: TextColor }> = {
  primary: {
    container: {
      backgroundColor: colors.darkAction, // Warm Dark Gray (Graphite)
      borderWidth: 1,
      borderColor: colors.darkActionBorder,
    },
    text: colors.textInverse,
  },
  secondary: {
    container: { backgroundColor: colors.surfaceSubtle, borderColor: colors.border },
    text: colors.textPrimary,
  },
  outline: {
    container: { backgroundColor: 'transparent', borderColor: colors.primaryBorder },
    text: colors.primary,
  },
  ghost: {
    container: { backgroundColor: 'transparent', borderColor: 'transparent' },
    text: colors.primary,
  },
  danger: {
    container: { backgroundColor: colors.danger, borderColor: colors.danger },
    text: colors.textInverse,
  },
};

const SIZE_METRICS: Record<ButtonSize, { icon: number; variant: 'label' | 'bodyMedium' | 'headline'; rowGap: ViewStyle }> = {
  sm: { icon: 16, variant: 'label', rowGap: { gap: 6 } },
  md: { icon: 18, variant: 'bodyMedium', rowGap: { gap: 8 } },
  lg: { icon: 20, variant: 'headline', rowGap: { gap: 10 } },
};

const sizeStyles = StyleSheet.create({
  sm: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.control,
  },
  /**
   * 48pt, not 44. This is the size every primary action on a card or a sheet
   * uses ("Start Handover", "Inspect Issue"), and it is the one an operator
   * hits while holding a scanner in the other hand. 44pt is the general
   * minimum; a primary action gets the Material/iOS comfortable target.
   */
  md: {
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radii.control,
  },
  lg: {
    minHeight: 52,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: radii.md,
  },
});

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    // A short label ("OK", "Cancel") would otherwise produce a ~60x44 control;
    // the 44pt floor keeps every button, whatever its text, thumb-sized.
    minWidth: 44,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  /**
   * The icon slot keeps its width when the label wraps, and `flexShrink: 0`
   * stops the glyph from being squashed by a long label.
   */
  /**
   * The label is the only element allowed to give up width: it wraps inside the
   * pill instead of escaping it. `textAlign: center` keeps a wrapped label
   * centred, which a plain RN `Text` would left-align.
   */
  label: {
    flexShrink: 1,
    textAlign: 'center',
  },
  slot: {
    flexShrink: 0,
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  /** Subtle mechanical press: 2% travel, no colour swap. */
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  primaryIconWell: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '../theme/colors';
import { radii } from '../theme/radii';
import { shadows } from '../theme/shadows';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps {
  children: React.ReactNode;
  /** `md` unless a dense list of rows needs to fit more per screen. */
  padding?: CardPadding;
  /** Present → the card becomes tappable. Pressed state is a 2% opacity dip. */
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /**
   * Gap between the card's own children, in points.
   *
   * This lives on the *inner* wrapper on purpose: `style` lands on the outer
   * card, which is a single child box and therefore has nothing to space out.
   * A `gap` passed in `style` is silently inert, which is how the Home hero
   * card ended up with its rows flush against each other while the stylesheet
   * said otherwise.
   */
  gap?: number;
  /** Extra styles for the inner content wrapper — background wells, insets. */
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * The default content container: white surface, 1px hairline, one soft shadow.
 *
 * Flat by construction. There is no bevel and no gradient — cards separate
 * themselves from the `#f8fafc` canvas through the border and `shadows.md`, and
 * the caller keeps control of internal rhythm through `padding` and `gap`.
 */
export function Card({
  children,
  padding = 'md',
  onPress,
  disabled = false,
  accessibilityLabel,
  style,
  gap,
  contentStyle,
}: CardProps) {
  const body = (
    <View style={[styles.inner, paddingStyles[padding], gap !== undefined && { gap }, contentStyle]}>
      {children}
    </View>
  );

  if (!onPress) {
    return <View style={[styles.card, style]}>{body}</View>;
  }

  const isInteractive = !disabled;
  return (
    <Pressable
      onPress={isInteractive ? onPress : undefined}
      disabled={!isInteractive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      /**
       * `minWidth` / `minHeight` keep a tappable card at the 44pt touch floor
       * even when its content is a single short row — a two-word fleet chip is
       * otherwise a ~30pt target, which is the size a gloved thumb misses.
       */
      style={({ pressed }) => [
        styles.card,
        styles.cardPressable,
        pressed && isInteractive && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {body}
    </Pressable>
  );
}

const paddingStyles = StyleSheet.create({
  none: { padding: 0 },
  sm: { padding: 12 },
  md: { padding: 16 },
  lg: { padding: 20 },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.md,
  },
  /** `overflow: hidden` lives on the outer card so the hairline follows the radius. */
  inner: {
    width: '100%',
  },
  /** Touch floor for a pressable card — see the call site for the reasoning. */
  cardPressable: {
    minWidth: 44,
    minHeight: 44,
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.5,
  },
});
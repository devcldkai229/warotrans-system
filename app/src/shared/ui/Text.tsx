import React from 'react';
import {
  StyleProp,
  Text as RNText,
  TextProps as RNTextProps,
  TextStyle,
} from 'react-native';
import { ColorToken, colors } from '../theme/colors';
import { TextVariant, typography } from '../theme/typography';

/**
 * A token name (`'textPrimary'`, `'primary'`) or any raw string (`'#121317'`,
 * `'rgba(15,23,42,0.7)'`).
 *
 * The `string & {}` arm keeps editor autocomplete for the tokens while still
 * accepting one-off values from a caller that already has a colour in hand.
 *
 * Token *names* resolve against `colors` at render time, so a value can be
 * passed by name and still follow the palette. `hasOwnProperty` is used rather
 * than a truthiness check so an inherited key such as `'constructor'` resolves
 * to `undefined` (fall through to the raw string) instead of leaking
 * `Object.prototype`.
 */
export type TextColor = ColorToken | (string & {});

/**
 * Resolve a `Text` `color` prop: token name first, then the literal string,
 * then the per-variant default.
 */
function resolveColor(color: TextColor | undefined, fallback: string): string {
  if (color == null) return fallback;
  if (Object.prototype.hasOwnProperty.call(colors, color)) {
    const token = (colors as Record<string, unknown>)[color];
    if (typeof token === 'string') return token;
  }
  return color;
}

/**
 * Default foreground per variant, so `<Text variant="caption">` is readable
 * without restating a colour at every call site. Anything that carries meaning
 * an operator must not skim past (a step title, a barcode) uses `body` or
 * heavier, which defaults to full-strength `textPrimary`.
 */
const DEFAULT_COLOR: Record<TextVariant, string> = {
  display: colors.textPrimary,
  title: colors.textPrimary,
  headline: colors.textPrimary,
  body: colors.textPrimary,
  bodyMedium: colors.textPrimary,
  label: colors.textSecondary,
  caption: colors.textSecondary,
  code: colors.textPrimary,
};

export interface TextProps extends Omit<RNTextProps, 'style'> {
  /** Typographic step. Defaults to `body`. */
  variant?: TextVariant;
  /** Token name or raw colour. Defaults per variant (see `DEFAULT_COLOR`). */
  color?: TextColor;
  textAlign?: TextStyle['textAlign'];
  numberOfLines?: number;
  /** Force the monospace face. Defaults to true for `variant="code"`. */
  mono?: boolean;
  /** Weight override for the rare case a step needs more or less presence. */
  fontWeight?: TextStyle['fontWeight'];
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

/**
 * The only text element new screens should import.
 *
 * Every `fontSize` in the app comes from `typography` — the scale bottoms out
 * at 12pt, so nothing an operator has to read can drop below that.
 *
 * There is deliberately **no `uppercase` prop**. Phase 0 set `textTransform:
 * 'uppercase'` with wide tracking on every eyebrow and status tag, which reads
 * as shouting on a screen an operator glances at while walking. Title Case is
 * the rule now; a label that genuinely needs emphasis gets a heavier weight.
 */
export function Text({
  variant = 'body',
  color,
  textAlign,
  numberOfLines,
  mono,
  fontWeight,
  style,
  children,
  ...rest
}: TextProps) {
  const useMono = mono ?? variant === 'code';

  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        typography[variant],
        { fontFamily: useMono ? typography.fontMono : typography.fontSans },
        { color: resolveColor(color, DEFAULT_COLOR[variant]) },
        textAlign ? { textAlign } : null,
        fontWeight ? { fontWeight } : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}
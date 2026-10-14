import { Platform, TextStyle } from 'react-native';

/**
 * Inter is FIRST on web on purpose. The stack used to start with
 * `-apple-system`, so the web prototype rendered in San Francisco on a
 * reviewer's Mac but Inter on Windows/Linux - the same build looked different
 * per machine. Inter is loaded with weights 400-900 from Google Fonts
 * (App.tsx), so weight 700 is a real face, not a synthesised faux-bold like the
 * browser's default fallback.
 *
 * `undefined` on native is deliberate: San Francisco and Roboto are system
 * faces there, and naming them explicitly would fight the OS text rendering.
 */
const fontSans = Platform.select({
  web: "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif",
  default: undefined,
});

const fontMono = Platform.select({
  web: "'JetBrains Mono', Menlo, 'SF Mono', Consolas, 'Roboto Mono', monospace",
  default: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
});

/**
 * Type scale.
 *
 * RULE: nothing below 12pt. Body copy is 14pt and titles are 16pt+ because the
 * app is read at arm's length on a handheld, in bad light, by someone walking.
 * `code` is the one monospaced step — IDs, barcodes and telemetry values — and
 * it sits at 12pt so it never becomes the smallest thing on screen.
 *
 * Legacy screens still declare their own `fontSize` inline; they migrate to the
 * `Text` primitive in later phases.
 */
const typeScale = {
  /** Screen-level statement. One per screen, never two. */
  display: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  /** Section title / modal title. */
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
  },
  /** Card heading, header title. */
  headline: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  /** Default paragraph text. */
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  /** Body that carries meaning the operator must not skim past. */
  bodyMedium: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  /** Field labels, control labels, section eyebrows. */
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  /** Supporting text: timestamps, hints, metadata. */
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },
  /** Monospaced identifiers: barcodes, endpoint codes, telemetry. */
  code: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
} satisfies Record<string, TextStyle>;

export const typography = {
  fontSans,
  fontMono,
  ...typeScale,
};

/** The typographic step a `<Text variant="...">` renders. */
export type TextVariant = keyof typeof typeScale;

/** Alias kept for callers that think in "type scale" rather than "text". */
export type TypographyVariant = TextVariant;

export type TypeScale = typeof typeScale;
/**
 * "Calm Operations" palette — Light & Dark ("Calm Operations Dark").
 *
 * Synchronized with the WaroTrans Admin Web Console (`web/src/index.css`):
 *   - Light: neutral slate canvas `#eef1f6`, crisp `#ffffff` cards, cobalt `#3279f9`
 *   - Dark:  carbon canvas `#18191a`, elevated `#242526` cards, `#1c1d1f` inset wells,
 *            `#3a3b3c` muted tracks, `#e4e6eb` primary ink, cobalt `#2d88ff`
 */

const LEGACY_BORDER_LIGHT = '#e2e8f0';

export const lightColors = {
  /* ---------------------------------------------------------------- */
  /* Neutral surfaces                                                  */
  /* ---------------------------------------------------------------- */
  /** Canvas behind every screen. */
  background: '#eef1f6',
  /** Cards, sheets, modals, headers. */
  surface: '#ffffff',
  /** Inset fill inside a card: route rows, detail blocks, icon wells. */
  surfaceSubtle: '#f4f6fa',
  /** Quieter still: segmented control tracks, skeleton rows, disabled fills. */
  surfaceMuted: '#e5e9f0',

  /* ---------------------------------------------------------------- */
  /* Borders                                                           */
  /* ---------------------------------------------------------------- */
  /** Default 1px hairline. Translucent so it works on any surface. */
  border: 'rgba(33, 34, 38, 0.08)',
  /** Hairline that must read as a boundary on top of `background`. */
  borderStrong: '#c4c8d0',

  /* ---------------------------------------------------------------- */
  /* Text                                                             */
  /* ---------------------------------------------------------------- */
  textPrimary: '#121317',
  textSecondary: '#45474d',
  /** Notes and placeholders only — never for content an operator must read. */
  textMuted: '#6a6a71',
  textInverse: '#ffffff',

  /* ---------------------------------------------------------------- */
  /* Brand accent                                                     */
  /* ---------------------------------------------------------------- */
  /** Primary brand blue, matching Admin Web (`--color-blue: #3279f9`). */
  primary: '#3279f9',
  /** Pressed / darker tone matching Admin Web (`--color-blue-ink: #1a5cd6`). */
  primaryDark: '#1a5cd6',
  /** Tinted surface matching Admin Web (`--color-blue-soft: #e9f1ff`). */
  primaryLight: '#e9f1ff',
  /** Hairline for accent-bordered controls. */
  primaryBorder: '#b8d5ff',
  /** Accent foreground on light backgrounds. */
  primaryText: '#1a5cd6',

  /* ---------------------------------------------------------------- */
  /* Warm Dark Gray action tokens (Tactile Hardware CTAs)             */
  /* ---------------------------------------------------------------- */
  /** Warm Dark Gray for signature buttons — matte graphite / warm slate. */
  darkAction: '#32353e',
  darkActionPressed: '#23252c',
  darkActionBorder: 'rgba(255, 255, 255, 0.18)',

  /* ---------------------------------------------------------------- */
  /* Semantics                                                        */
  /* ---------------------------------------------------------------- */
  success: '#059669',
  successBg: '#ecfdf5',
  successBorder: '#a7f3d0',
  /** Foreground on `successBg` (emerald-700, ~5.2:1). */
  successText: '#047857',

  warning: '#d97706',
  warningBg: '#fffbeb',
  warningBorder: '#fde68a',
  /** Foreground on `warningBg` (amber-800, ~6.8:1). */
  warningText: '#92400e',

  danger: '#dc2626',
  dangerBg: '#fef2f2',
  dangerBorder: '#fecaca',
  /** Foreground on `dangerBg` (red-700, ~6.1:1). */
  dangerText: '#b91c1c',

  info: '#0284c7',
  infoBg: '#f0f9ff',
  infoBorder: '#bae6fd',
  /** Foreground on `infoBg` (sky-800, ~5.6:1). */
  infoText: '#0369a1',

  /* ---------------------------------------------------------------- */
  /* Blueprint map tokens — used by the facility map preview and by    */
  /* JobLiveMapScreen.                                                */
  /* ---------------------------------------------------------------- */
  mapBackground: '#e9eefa',
  mapGrid: '#d5dcee',
  mapLine: '#bccae2',
  mapRack: '#c4c8d0',
  mapZoneBg: 'rgba(255, 255, 255, 0.92)',

  /* ---------------------------------------------------------------- */
  /* Legacy aliases — remove as callers migrate                        */
  /* ---------------------------------------------------------------- */
  borderSubtle: LEGACY_BORDER_LIGHT,
  borderDark: '#9aa0a6',
  successSoft: '#d1fae5',
  warningSoft: '#fef3c7',
  dangerSoft: '#fee2e2',
  overlay: 'rgba(15, 23, 42, 0.45)',
} as const;

export type ColorToken = keyof typeof lightColors;
export type ThemeColors = { [K in ColorToken]: string };
export type ResolvedColorScheme = 'light' | 'dark';

export const darkColors: ThemeColors = {
  /* ---------------------------------------------------------------- */
  /* Neutral surfaces ("Calm Operations Dark" Tonal Ladder)           */
  /* ---------------------------------------------------------------- */
  background: '#18191a',
  surface: '#242526',
  surfaceSubtle: '#1c1d1f',
  surfaceMuted: '#3a3b3c',

  /* ---------------------------------------------------------------- */
  /* Borders                                                           */
  /* ---------------------------------------------------------------- */
  border: 'rgba(255, 255, 255, 0.10)',
  borderStrong: '#4e4f50',

  /* ---------------------------------------------------------------- */
  /* Text                                                             */
  /* ---------------------------------------------------------------- */
  textPrimary: '#e4e6eb',
  textSecondary: '#b0b3b8',
  textMuted: '#8a8d91',
  textInverse: '#121317',

  /* ---------------------------------------------------------------- */
  /* Brand accent                                                     */
  /* ---------------------------------------------------------------- */
  primary: '#2d88ff',
  primaryDark: '#2374e1',
  primaryLight: 'rgba(45, 136, 255, 0.18)',
  primaryBorder: 'rgba(108, 176, 255, 0.36)',
  primaryText: '#6cb0ff',

  /* ---------------------------------------------------------------- */
  /* Hardware CTA                                                     */
  /* ---------------------------------------------------------------- */
  darkAction: '#3a3b3c',
  darkActionPressed: '#4e4f50',
  darkActionBorder: 'rgba(255, 255, 255, 0.22)',

  /* ---------------------------------------------------------------- */
  /* Semantics                                                        */
  /* ---------------------------------------------------------------- */
  success: '#45bd62',
  successBg: 'rgba(69, 189, 98, 0.16)',
  successBorder: 'rgba(111, 217, 138, 0.32)',
  successText: '#6fd98a',

  warning: '#f7b928',
  warningBg: 'rgba(247, 185, 40, 0.16)',
  warningBorder: 'rgba(251, 208, 98, 0.32)',
  warningText: '#fbd062',

  danger: '#f02849',
  dangerBg: 'rgba(240, 40, 73, 0.16)',
  dangerBorder: 'rgba(255, 122, 142, 0.32)',
  dangerText: '#ff7a8e',

  info: '#2d88ff',
  infoBg: 'rgba(45, 136, 255, 0.16)',
  infoBorder: 'rgba(108, 176, 255, 0.32)',
  infoText: '#6cb0ff',

  /* ---------------------------------------------------------------- */
  /* Warehouse Map                                                    */
  /* ---------------------------------------------------------------- */
  mapBackground: '#141619',
  mapGrid: '#262930',
  mapLine: '#3d4654',
  mapRack: '#343842',
  mapZoneBg: 'rgba(36, 37, 38, 0.92)',

  /* ---------------------------------------------------------------- */
  /* Legacy aliases                                                   */
  /* ---------------------------------------------------------------- */
  borderSubtle: 'rgba(255, 255, 255, 0.10)',
  borderDark: '#65676b',
  successSoft: 'rgba(69, 189, 98, 0.22)',
  warningSoft: 'rgba(247, 185, 40, 0.22)',
  dangerSoft: 'rgba(240, 40, 73, 0.22)',
  overlay: 'rgba(0, 0, 0, 0.68)',
};

/**
 * Reverse lookup from light palette hex values to semantic token names so
 * components like `<Text color={colors.textSecondary}>` resolve dynamically
 * to the active theme palette even if the caller passed a resolved hex value.
 */
export const LIGHT_HEX_TO_TOKEN: Readonly<Record<string, ColorToken>> = {
  '#121317': 'textPrimary',
  '#0f172a': 'textPrimary',
  '#45474d': 'textSecondary',
  '#475569': 'textSecondary',
  '#6a6a71': 'textMuted',
  '#64748b': 'textMuted',
  '#3279f9': 'primary',
  '#1a5cd6': 'primaryText',
  '#059669': 'success',
  '#047857': 'successText',
  '#d97706': 'warning',
  '#92400e': 'warningText',
  '#dc2626': 'danger',
  '#b91c1c': 'dangerText',
  '#0284c7': 'info',
  '#0369a1': 'infoText',
};

/**
 * Active mutable palette object. Synchronized in-place via `syncActiveColors`
 * whenever `ThemeProvider` changes the resolved scheme so pure utility helpers
 * (`zoneColor()`, etc.) always read the current scheme's tokens.
 */
export const colors: ThemeColors = { ...lightColors };

let currentResolvedScheme: ResolvedColorScheme = 'light';

export function getActiveColorScheme(): ResolvedColorScheme {
  return currentResolvedScheme;
}

export function syncActiveColors(scheme: ResolvedColorScheme): ThemeColors {
  currentResolvedScheme = scheme;
  const source = scheme === 'dark' ? darkColors : lightColors;
  Object.assign(colors, source);
  return source;
}

/** Semantic tone shared by `StatusPill`, `Badge`, and screen-level tone maps. */
export type SemanticTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Every value in the palette, typed as a plain string for style props. */
export type ColorValue = string;

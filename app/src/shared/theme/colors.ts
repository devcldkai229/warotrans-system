/**
 * "Calm Operations" palette.
 *
 * Read the real token from this file instead of hardcoding a hex value: the
 * Phase 1 redesign re-tunes several tones, and a literal silently drifts.
 *
 * Structure:
 *   1. Neutral surfaces  — canvas, cards, hairlines
 *   2. Text              — near-black / grey, readable on canvas AND on white
 *   3. Brand accent      — cobalt, plus the tint used for selected chips
 *   4. Semantics         — success / warning / danger / info, each with
 *                         `*Bg` (tint surface), `*Border` (hairline) and
 *                         `*Text` (WCAG-safe foreground on that tint)
 *   5. Legacy aliases    — tokens kept because un-migrated screens still read
 *                         them; delete each one as its last caller moves.
 */

/** Legacy — un-migrated screens only. Alias of `border`. */
const LEGACY_BORDER = '#e2e8f0';

export const colors = {
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
  /**
   * Primary brand blue, exactly matching Admin Web (`--color-blue: #3279f9`).
   */
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
  /* JobLiveMapScreen. Retuned off cyan so the map reads as a quiet    */
  /* slate canvas rather than a saturated blueprint.                  */
  /* ---------------------------------------------------------------- */
  mapBackground: '#e9eefa',
  mapGrid: '#d5dcee',
  mapLine: '#bccae2',
  mapRack: '#c4c8d0',
  mapZoneBg: 'rgba(255, 255, 255, 0.92)',

  /* ---------------------------------------------------------------- */
  /* Legacy aliases — remove as callers migrate                        */
  /* ---------------------------------------------------------------- */
  borderSubtle: LEGACY_BORDER,
  borderDark: '#9aa0a6',
  successSoft: '#d1fae5',
  warningSoft: '#fef3c7',
  dangerSoft: '#fee2e2',
  overlay: 'rgba(15, 23, 42, 0.45)',
} as const;

export type ColorToken = keyof typeof colors;

/** Semantic tone shared by `StatusPill`, `Badge`, and screen-level tone maps. */
export type SemanticTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Every value in the palette, typed as a plain string for style props. */
export type ColorValue = (typeof colors)[ColorToken];
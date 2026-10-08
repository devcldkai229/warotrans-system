export const colors = {
  // Brand colors (Calibrated rich cobalt blue matching prototype oklch(0.5 0.2 256))
  primary: '#005cd1', // Rich industrial cobalt blue
  primaryDark: '#004bb0',
  primaryLight: '#ebf3ff', // Soft subtle blue tint
  primaryBorder: '#b8d5ff',

  // Backgrounds
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceSubtle: '#f1f5f9',
  surfaceMuted: '#e2e8f0',

  // Blueprint Map Tokens
  mapBackground: '#e0f2fe',
  mapGrid: '#bae6fd',
  mapLine: '#7dd3fc',
  mapRack: '#cbd5e1',
  mapZoneBg: 'rgba(255, 255, 255, 0.85)',

  // Text colors (Calibrated high-contrast midnight tones matching prototype oklch(0.19 0.035 250))
  textPrimary: '#071523', // Deep midnight navy-black
  textSecondary: '#54657d', // Industrial slate-blue
  textMuted: '#8b9cb0', // Balanced muted gray-blue
  textInverse: '#ffffff',

  // Status Tones (Deep forest green matching prototype oklch(0.5 0.15 154))
  success: '#007a38', // Darker rich forest green
  successBg: '#eefaf2',
  successSoft: '#d2f4dc',
  successBorder: '#a3e5b9',

  // Warning (Industrial amber yellow matching prototype oklch(0.8 0.16 82))
  warning: '#f0b21b',
  warningBg: '#fffbf0',
  warningSoft: '#fef3c7',
  warningBorder: '#fcd34d',

  // Danger (Industrial emergency red matching prototype oklch(0.55 0.22 26))
  danger: '#c8272b',
  dangerBg: '#fef2f2',
  dangerSoft: '#fee2e2',
  dangerBorder: '#fca5a5',

  // Info
  info: '#005cd1',
  infoBg: '#ebf3ff',
  infoBorder: '#b8d5ff',

  // Border & Dividers
  border: '#d7dfe9',
  borderDark: '#99a7b8',

  // Overlay
  overlay: 'rgba(7, 21, 35, 0.55)',
} as const;

export type ColorToken = keyof typeof colors;

export const colors = {
  // Brand colors (Vibrant Royal Industrial Blue matching prototype oklch(0.5 0.2 256))
  primary: '#2563eb', // Blue-600 (prototype primary)
  primaryDark: '#1d4ed8', // Blue-700
  primaryLight: '#eff6ff', // Blue-50
  primaryBorder: '#bfdbfe', // Blue-200

  // Backgrounds
  background: '#f8fafc', // Slate-50
  surface: '#ffffff',
  surfaceSubtle: '#f1f5f9', // Slate-100
  surfaceMuted: '#e2e8f0', // Slate-200

  // Blueprint Map Tokens
  mapBackground: '#e0f2fe', // Sky-100 technical blueprint paper
  mapGrid: '#bae6fd', // Sky-200 grid lines
  mapLine: '#7dd3fc', // Sky-300
  mapRack: '#cbd5e1', // Slate-300 bin cells
  mapZoneBg: 'rgba(255, 255, 255, 0.85)',

  // Text colors
  textPrimary: '#0f172a', // Slate-900
  textSecondary: '#475569', // Slate-600
  textMuted: '#94a3b8', // Slate-400
  textInverse: '#ffffff',

  // Status Tones
  success: '#16a34a', // Green-600
  successBg: '#f0fdf4',
  successSoft: '#dcfce7',
  successBorder: '#bbf7d0',

  warning: '#f59e0b', // Amber-500
  warningBg: '#fffbeb',
  warningSoft: '#fef3c7',
  warningBorder: '#fde68a',

  danger: '#ef4444', // Red-500
  dangerBg: '#fef2f2',
  dangerSoft: '#fee2e2',
  dangerBorder: '#fecaca',

  info: '#2563eb', // Blue-600
  infoBg: '#eff6ff',
  infoBorder: '#bfdbfe',

  // Border & Dividers
  border: '#e2e8f0',
  borderDark: '#cbd5e1',

  // Overlay
  overlay: 'rgba(15, 23, 42, 0.55)',
} as const;

export type ColorToken = keyof typeof colors;

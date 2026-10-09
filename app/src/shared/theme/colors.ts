export const colors = {
  // Brand colors
  primary: '#0e7490', // Cyan-700
  primaryDark: '#155e75', // Cyan-800
  primaryLight: '#e0f2fe', // Sky-100
  primaryBorder: '#bae6fd', // Sky-200

  // Backgrounds
  background: '#f8fafc', // Slate-50
  surface: '#ffffff',
  surfaceSubtle: '#f1f5f9', // Slate-100
  surfaceMuted: '#e2e8f0', // Slate-200

  // Text colors
  textPrimary: '#0f172a', // Slate-900
  textSecondary: '#475569', // Slate-600
  textMuted: '#94a3b8', // Slate-400
  textInverse: '#ffffff',

  // Status Tones
  success: '#16a34a', // Green-600
  successBg: '#f0fdf4',
  successBorder: '#bbf7d0',

  warning: '#d97706', // Amber-600
  warningBg: '#fffbeb',
  warningBorder: '#fde68a',

  danger: '#dc2626', // Red-600
  dangerBg: '#fef2f2',
  dangerBorder: '#fecaca',

  info: '#2563eb', // Blue-600
  infoBg: '#eff6ff',
  infoBorder: '#bfdbfe',

  // Border & Dividers
  border: '#e2e8f0',
  borderDark: '#cbd5e1',

  // Overlay
  overlay: 'rgba(15, 23, 42, 0.65)',
} as const;

export type ColorToken = keyof typeof colors;

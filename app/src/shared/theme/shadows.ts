import { ViewStyle } from 'react-native';
import { ResolvedColorScheme } from './colors';

/**
 * Elevation.
 *
 * Three steps only — `sm`, `md`, `lg`. "Calm Operations" gets its depth from
 * hairline borders plus a soft, wide, low-opacity shadow in Light mode, and
 * tonal surface hierarchy + stronger ambient shadow in Dark mode.
 *
 * Legacy keys (`panel`, `input`, `control`, `float`, `sheet`, `alert`) are still
 * read by un-migrated screens; delete each as its last caller moves onto `md`/`lg`.
 */
export const lightShadows = {
  /** 1px lift: pressed controls, active segments, inline chips. */
  sm: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  /** The default card elevation. Soft, wide, barely there. */
  md: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  /** Sheets and modals float clear of the canvas. */
  lg: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },

  /* ------------------------------------------------------------------ */
  /* Legacy — remove as callers migrate onto sm / md / lg                */
  /* ------------------------------------------------------------------ */
  panel: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  input: {
    shadowColor: '#1e293b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  control: {
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  float: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 6,
  },
  sheet: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 10,
  },
  alert: {
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
} satisfies Record<string, ViewStyle>;

export type ThemeShadows = typeof lightShadows;

export const darkShadows: ThemeShadows = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.28,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.36,
    shadowRadius: 12,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.52,
    shadowRadius: 24,
    elevation: 8,
  },
  panel: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.32,
    shadowRadius: 6,
    elevation: 2,
  },
  input: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.24,
    shadowRadius: 6,
    elevation: 2,
  },
  control: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.38,
    shadowRadius: 6,
    elevation: 3,
  },
  float: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 6,
  },
  sheet: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 10,
  },
  alert: {
    shadowColor: '#f02849',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
};

export const shadows: ThemeShadows = { ...lightShadows };

export function syncActiveShadows(scheme: ResolvedColorScheme): ThemeShadows {
  const source = scheme === 'dark' ? darkShadows : lightShadows;
  Object.assign(shadows, source);
  return source;
}

/** The three supported elevation steps, keyed for prop-driven selection. */
export type ShadowLevel = 'sm' | 'md' | 'lg';

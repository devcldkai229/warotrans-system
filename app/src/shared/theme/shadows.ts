import { ViewStyle } from 'react-native';

/**
 * Elevation.
 *
 * Three steps only — `sm`, `md`, `lg`. "Calm Operations" gets its depth from
 * hairline borders plus a soft, wide, low-opacity shadow rather than from heavy
 * bevels. Anything that needs a fourth level is a design problem, not a token.
 *
 * Android's `elevation` is set to roughly match the iOS blur so a card does not
 * visibly "pop" when the same build runs on a PDA.
 *
 * Legacy keys (`panel`, `input`, `control`, `float`, `sheet`, `alert`) are still
 * read by un-migrated screens; delete each as its last caller moves onto `md`/`lg`.
 */
export const shadows = {
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

/** The three supported elevation steps, keyed for prop-driven selection. */
export type ShadowLevel = 'sm' | 'md' | 'lg';

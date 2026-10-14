/**
 * Corner radius scale.
 *
 * One number per size step, so a card, its field and its button agree. The rule
 * the whole app follows: the further a surface floats from the canvas, the
 * rounder it gets — sheets are the roundest, inline chips the tightest.
 */
export const radii = {
  /** Inputs, buttons, cards, segmented controls. */
  md: 12,
  /** Sheets, modals, large containers. */
  lg: 16,
  /** Chips, status pills, inline tags. */
  sm: 8,
  /** Inputs and compact buttons (44pt tall, so 8 reads as a rectangle). */
  control: 10,
  /** Pills, circles, avatars. */
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radii;
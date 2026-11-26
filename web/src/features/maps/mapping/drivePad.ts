import { t } from '@/shared/i18n'

/** One pad button: forward in [-1, 1] (+ forward), turn in [-1, 1] (+ left / counter-clockwise). */
export interface PadMove {
  key: string
  forward: number
  turn: number
  label: () => string
  glyph: string
}

/**
 * Mapping drive: straight lines, slow turns on the spot and gentle curves are what slam_toolbox needs. Each button is
 * one clean motion (no analog mixing), held to drive and released to stop. Backing up "left" swings the back of the
 * robot to the left, so the robot turns clockwise.
 */
export const PAD_MOVES: (PadMove | null)[] = [
  { key: 'fl', forward: 1, turn: 0.5, label: () => t('Forward, curving left'), glyph: '↖' },
  { key: 'f', forward: 1, turn: 0, label: () => t('Drive forward'), glyph: '↑' },
  { key: 'fr', forward: 1, turn: -0.5, label: () => t('Forward, curving right'), glyph: '↗' },
  { key: 'l', forward: 0, turn: 1, label: () => t('Turn left on the spot'), glyph: '⟲' },
  null, // STOP
  { key: 'r', forward: 0, turn: -1, label: () => t('Turn right on the spot'), glyph: '⟳' },
  { key: 'bl', forward: -1, turn: -0.5, label: () => t('Back up, curving left'), glyph: '↙' },
  { key: 'b', forward: -1, turn: 0, label: () => t('Drive backward'), glyph: '↓' },
  { key: 'br', forward: -1, turn: 0.5, label: () => t('Back up, curving right'), glyph: '↘' },
]

/** Keys held → the pad motion they mean (arrows / WASD as before, Q / E turn on the spot). */
export function keysToMove(has: (k: string) => boolean): { forward: number; turn: number; key: string | null } {
  const forward = (has('f') ? 1 : 0) - (has('b') ? 1 : 0)
  const left = (has('l') || has('q') ? 1 : 0) - (has('r') || has('e') ? 1 : 0)
  if (forward === 0) {
    return { forward: 0, turn: left, key: left > 0 ? 'l' : left < 0 ? 'r' : null }
  }
  // Driving: left/right only curve, like the diagonal buttons (backing up mirrors the turn).
  const turn = left === 0 ? 0 : (forward > 0 ? left : -left) * 0.5
  const side = left > 0 ? 'l' : left < 0 ? 'r' : ''
  return { forward, turn, key: (forward > 0 ? 'f' : 'b') + side }
}

import { describe, expect, it } from 'vitest'
import { keysToMove, PAD_MOVES } from './drivePad'

const held = (...keys: string[]) => (k: string) => keys.includes(k)

describe('mapping drive pad', () => {
  it('turns on the spot with left/right or Q/E alone', () => {
    expect(keysToMove(held('l'))).toEqual({ forward: 0, turn: 1, key: 'l' })
    expect(keysToMove(held('e'))).toEqual({ forward: 0, turn: -1, key: 'r' })
  })

  it('only curves gently while driving, mirrored when backing up', () => {
    expect(keysToMove(held('f', 'l'))).toEqual({ forward: 1, turn: 0.5, key: 'fl' })
    expect(keysToMove(held('b', 'l'))).toEqual({ forward: -1, turn: -0.5, key: 'bl' })
  })

  it('stops when nothing (or opposite keys) is held', () => {
    expect(keysToMove(held())).toEqual({ forward: 0, turn: 0, key: null })
    expect(keysToMove(held('f', 'b'))).toEqual({ forward: 0, turn: 0, key: null })
  })

  it('keyboard motions match the pad buttons', () => {
    for (const move of PAD_MOVES.filter((m) => m !== null)) {
      const keys = move.key.split('').map((c) => (c === 'l' ? 'l' : c === 'r' ? 'r' : c))
      const got = keysToMove(held(...keys))
      expect([got.forward, got.turn, got.key]).toEqual([move.forward, move.turn, move.key])
    }
  })
})

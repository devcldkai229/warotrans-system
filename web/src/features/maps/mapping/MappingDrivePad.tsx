import { useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { cx } from '@/shared/lib/cx'
import { t } from '@/shared/i18n'
import { PAD_MOVES, type PadMove } from './drivePad'

interface MappingDrivePadProps {
  disabled: boolean
  /** Key of the motion the keyboard is driving now (highlighted like a held button). */
  keyboardActive?: string | null
  onChange: (forward: number, turn: number) => void
}

export function MappingDrivePad({ disabled, keyboardActive, onChange }: MappingDrivePadProps) {
  const [held, setHeld] = useState<string | null>(null)

  const release = () => {
    setHeld(null)
    onChange(0, 0)
  }

  const holdProps = (move: PadMove) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (disabled) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      setHeld(move.key)
      onChange(move.forward, move.turn)
    },
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: () => held === move.key && release(),
    onContextMenu: (event: ReactMouseEvent) => event.preventDefault(),
  })

  const BUTTON =
    'grid size-[68px] touch-none place-items-center rounded-xl border text-3xl leading-none select-none transition-colors duration-100 disabled:cursor-not-allowed'

  return (
    <div className={cx('grid grid-cols-3 gap-2', disabled && 'opacity-45')} role="group" aria-label={t('Drive pad')}>
      {PAD_MOVES.map((move) =>
        move ? (
          <button
            key={move.key}
            type="button"
            title={move.label()}
            aria-label={move.label()}
            aria-pressed={held === move.key || keyboardActive === move.key}
            disabled={disabled}
            className={cx(
              BUTTON,
              held === move.key || keyboardActive === move.key
                ? 'border-green bg-green text-white shadow-float'
                : 'border-outline-soft bg-surface text-ink hover:bg-container-high',
              move.forward === 0 && 'text-blue-ink',
            )}
            {...holdProps(move)}
          >
            {move.glyph}
          </button>
        ) : (
          <button
            key="stop"
            type="button"
            aria-label={t('Stop')}
            title={t('Stop (Space)')}
            className={cx(BUTTON, 'border-red bg-red-soft text-base font-semibold text-red-ink hover:bg-red hover:text-white')}
            onClick={release}
          >
            {t('STOP')}
          </button>
        ),
      )}
    </div>
  )
}

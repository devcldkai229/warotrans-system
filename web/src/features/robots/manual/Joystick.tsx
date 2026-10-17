import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { cx } from '@/shared/lib/cx'

const RADIUS = 64 // px, knob travel
const DEADZONE = 0.12

interface JoystickProps {
  disabled: boolean
  /** Normalised stick: forward/back in [-1, 1] (+ forward), turn in [-1, 1] (+ left). `(0, 0)` on release. */
  onChange: (forward: number, turn: number) => void
}

/**
 * Drag the knob: up/down = forward/reverse, left/right = turn, diagonal = both; the further from the centre the
 * faster. Release springs back and stops. ▲ / ▼ above and below drive straight while held.
 */
export function Joystick({ disabled, onChange }: JoystickProps) {
  const pad = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const [held, setHeld] = useState<'up' | 'down' | null>(null)

  function update(clientX: number, clientY: number) {
    const rect = pad.current?.getBoundingClientRect()
    if (!rect) return
    let dx = clientX - (rect.left + rect.width / 2)
    let dy = clientY - (rect.top + rect.height / 2)
    const length = Math.hypot(dx, dy)
    if (length > RADIUS) {
      dx = (dx / length) * RADIUS
      dy = (dy / length) * RADIUS
    }
    setKnob({ x: dx, y: dy })
    const nx = dx / RADIUS
    const ny = dy / RADIUS
    const dead = (v: number) => (Math.abs(v) < DEADZONE ? 0 : v)
    onChange(dead(-ny), dead(-nx))
  }

  function release() {
    setKnob({ x: 0, y: 0 })
    onChange(0, 0)
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    update(event.clientX, event.clientY)
  }

  const arrow = (dir: 'up' | 'down') => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (disabled) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      setHeld(dir)
      onChange(dir === 'up' ? 1 : -1, 0)
    },
    onPointerUp: () => {
      setHeld(null)
      onChange(0, 0)
    },
    onPointerCancel: () => {
      setHeld(null)
      onChange(0, 0)
    },
  })

  const ARROW =
    'grid h-9 w-16 touch-none place-items-center text-ink-2 transition-colors duration-150 select-none disabled:opacity-30'

  return (
    <div className={cx('flex flex-col items-center gap-1', disabled && 'opacity-45')}>
      <button type="button" aria-label="Drive forward" disabled={disabled} className={ARROW} {...arrow('up')}>
        <svg width="34" height="20" viewBox="0 0 34 20" className={held === 'up' ? 'fill-green' : 'fill-current'}>
          <path d="M17 1 33 19H1Z" />
        </svg>
      </button>
      <div
        ref={pad}
        role="slider"
        aria-label="Joystick"
        aria-valuetext={`forward ${(-knob.y / RADIUS).toFixed(2)}, turn ${(-knob.x / RADIUS).toFixed(2)}`}
        className={cx(
          'relative grid size-[164px] touch-none place-items-center rounded-full border border-outline-soft bg-surface text-ink-2 shadow-float select-none',
          disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing',
        )}
        onPointerDown={startDrag}
        onPointerMove={(event) => event.buttons && !disabled && update(event.clientX, event.clientY)}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        {/* Crosshair guides like the reference console. */}
        <svg className="pointer-events-none absolute inset-0" viewBox="0 0 164 164">
          <line x1="22" y1="22" x2="142" y2="142" stroke="currentColor" strokeOpacity="0.15" />
          <line x1="142" y1="22" x2="22" y2="142" stroke="currentColor" strokeOpacity="0.15" />
          <circle cx="82" cy="82" r="40" fill="none" stroke="currentColor" strokeOpacity="0.15" />
        </svg>
        <span
          className="pointer-events-none size-14 rounded-full border-4 border-surface bg-ink shadow-float"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
      </div>
      <button type="button" aria-label="Drive backward" disabled={disabled} className={ARROW} {...arrow('down')}>
        <svg width="34" height="20" viewBox="0 0 34 20" className={held === 'down' ? 'fill-green' : 'fill-current'}>
          <path d="M17 19 33 1H1Z" />
        </svg>
      </button>
    </div>
  )
}

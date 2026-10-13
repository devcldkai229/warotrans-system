import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { cx } from '@/shared/lib/cx'
import { normalizeYaw } from './yaw'

/** Quick targets around the dial: tap one to face that way. */
const CARDINALS = [
  { label: 'E', degrees: 0 },
  { label: 'N', degrees: 90 },
  { label: 'W', degrees: 180 },
  { label: 'S', degrees: -90 },
]

// Protractor ticks: one every 5°, a longer blue one every 45°.
const TICKS = Array.from({ length: 72 }, (_, index) => index * 5)

interface HeadingDialProps {
  /** Centre of the dial in sheet pixels (the Endpoint position). */
  x: number
  y: number
  /** Degrees, 0 = facing +X (east), counter-clockwise positive, as the Robot's pose yaw. */
  yaw: number
  onChange: (yaw: number) => void
}

/**
 * A protractor around an Endpoint: drag the handle (or click anywhere on the disc) to set the heading the Robot
 * must have when it arrives. Hold Shift to snap to 15°.
 */
export function HeadingDial({ x, y, yaw, onChange }: HeadingDialProps) {
  const disc = useRef<HTMLDivElement>(null)

  function angleFrom(event: PointerEvent | ReactPointerEvent): number {
    const rect = disc.current?.getBoundingClientRect()
    if (!rect) return yaw
    const centreX = rect.left + rect.width / 2
    const centreY = rect.top + rect.height / 2
    // Screen Y grows downwards while the map's Y (and yaw) grow upwards.
    let degrees = (Math.atan2(centreY - event.clientY, event.clientX - centreX) * 180) / Math.PI
    degrees = event.shiftKey ? Math.round(degrees / 15) * 15 : Math.round(degrees)
    return normalizeYaw(degrees)
  }

  function startDrag(event: ReactPointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    onChange(angleFrom(event))
    const move = (moveEvent: PointerEvent) => onChange(angleFrom(moveEvent))
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  return (
    <div className="absolute z-7 size-0" style={{ left: x, top: y }} onClick={(event) => event.stopPropagation()}>
      <div
        ref={disc}
        className="absolute -top-16 -left-16 size-32 cursor-pointer rounded-full bg-surface/90 shadow-float"
        title="Drag to rotate. Hold Shift for 15° steps."
        onPointerDown={startDrag}
      >
        <svg className="pointer-events-none size-full" viewBox="-64 -64 128 128" aria-hidden="true">
          {TICKS.map((degrees) => {
            const major = degrees % 45 === 0
            return (
              <line
                key={degrees}
                x1={major ? 53 : 57}
                x2={62}
                y1={0}
                y2={0}
                stroke={major ? '#3279f9' : '#b2bbc5'}
                strokeWidth={major ? 1.5 : 1}
                strokeLinecap="round"
                transform={`rotate(${degrees})`}
              />
            )
          })}
        </svg>
      </div>

      {CARDINALS.map((cardinal) => (
        <button
          key={cardinal.label}
          type="button"
          className={cx(
            'absolute top-0 left-0 grid size-6 place-items-center rounded-full text-xs font-medium shadow-float transition-colors duration-200',
            yaw === cardinal.degrees ? 'bg-ink text-surface' : 'bg-surface text-ink-2 hover:text-blue-ink',
          )}
          style={{
            transform: `translate(-50%, -50%) rotate(${-cardinal.degrees}deg) translateX(94px) rotate(${cardinal.degrees}deg)`,
          }}
          aria-label={`Face ${cardinal.label} (${cardinal.degrees}°)`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onChange(cardinal.degrees)}
        >
          {cardinal.label}
        </button>
      ))}

      <div
        className="pointer-events-none absolute -top-0.5 left-0 h-1 w-16 origin-left rounded-full bg-linear-to-r from-blue/20 to-blue"
        style={{ transform: `rotate(${-yaw}deg)` }}
      >
        <span
          className="pointer-events-auto absolute -top-3 -right-3.5 grid size-7 cursor-grab place-items-center rounded-full bg-blue text-white ring-2 ring-surface transition-transform duration-100 select-none hover:scale-110 active:scale-115 active:cursor-grabbing"
          onPointerDown={startDrag}
          aria-label="Drag to set heading"
          role="slider"
          aria-valuenow={yaw}
          aria-valuemin={-180}
          aria-valuemax={180}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
      <span className="pointer-events-none absolute -top-1.5 -left-1.5 size-3 rounded-full bg-surface ring-[3px] ring-blue" />

      <div className="pointer-events-none absolute top-28 -left-32 flex w-64 flex-col items-center">
        <strong className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-medium text-surface tabular-nums">{yaw}°</strong>
        <span className="mt-1 rounded-full bg-surface/90 px-2 text-xs whitespace-nowrap text-ink-2">Drag the knob. Shift snaps to 15°.</span>
      </div>
    </div>
  )
}

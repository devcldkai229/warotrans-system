import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { normalizeYaw } from './yaw'

/** Quick targets around the dial: tap one to face that way. */
const CARDINALS = [
  { label: 'E', degrees: 0 },
  { label: 'N', degrees: 90 },
  { label: 'W', degrees: 180 },
  { label: 'S', degrees: -90 },
]

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
    <div className="hdial" style={{ left: x, top: y }} onClick={(event) => event.stopPropagation()}>
      <div
        ref={disc}
        className="hdial__disc"
        title="Drag to rotate · hold Shift for 15° steps"
        onPointerDown={startDrag}
      />

      {CARDINALS.map((cardinal) => (
        <button
          key={cardinal.label}
          type="button"
          className={`hdial__cardinal${yaw === cardinal.degrees ? ' is-on' : ''}`}
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

      <div className="hdial__arm" style={{ transform: `rotate(${-yaw}deg)` }}>
        <span
          className="hdial__handle"
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
      <span className="hdial__dot" />

      <div className="hdial__foot">
        <strong>{yaw}°</strong>
        <small>Drag the knob · Shift = 15° steps</small>
      </div>
    </div>
  )
}

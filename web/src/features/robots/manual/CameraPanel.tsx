import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { robotCameraStreamUrl } from '@/shared/api/fleet'
import { cx } from '@/shared/lib/cx'
import { Icon, type IconName } from '@/shared/ui/Icon'

const WIDTH_KEY = 'warotrans.manual.camera-width'
const MIN_WIDTH = 240
const DEFAULT_WIDTH = 320

/** Largest small-frame width that still leaves room for the joystick below and the map tools above. */
const maxWidth = () => Math.max(MIN_WIDTH, Math.min(window.innerWidth * 0.6, ((window.innerHeight - 320) * 16) / 9))

function readWidth() {
  try {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY))
    return stored >= MIN_WIDTH ? stored : DEFAULT_WIDTH
  } catch {
    return DEFAULT_WIDTH
  }
}

function saveWidth(width: number) {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(Math.round(width)))
  } catch {
    // per-viewer convenience only
  }
}

/**
 * Live camera of the robot (MJPEG through the backend). A small frame in the bottom-right corner, resized by
 * dragging its top-left corner, or full screen. One <img> in both modes, so switching does not reconnect.
 * The stream is independent of the robot gateway, so it shows even while the robot is offline for MQTT.
 */
export function CameraPanel({ robotId }: { robotId: string }) {
  const [width, setWidth] = useState(readWidth)
  const [fullscreen, setFullscreen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [nonce, setNonce] = useState(() => Date.now())
  const drag = useRef<{ x: number; width: number } | null>(null)

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  function retry() {
    setFailed(false)
    setLoaded(false)
    setNonce(Date.now()) // new URL → new connection, with the current access token
  }

  // Anchored bottom-right, so dragging the top-left corner left/up makes the frame larger.
  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, width }
  }
  function resize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    setWidth(Math.min(maxWidth(), Math.max(MIN_WIDTH, drag.current.width + drag.current.x - event.clientX)))
  }
  function endResize() {
    if (!drag.current) return
    drag.current = null
    saveWidth(width)
  }

  if (hidden) {
    return (
      <button
        type="button"
        className="flex items-center gap-2 rounded-full bg-surface px-3 py-2 text-xs text-ink-2 shadow-float hover:text-ink"
        onClick={() => {
          setHidden(false)
          retry()
        }}
      >
        <Icon name="play" size={13} /> Camera
      </button>
    )
  }

  const status = failed ? 'unavailable' : loaded ? 'live' : 'connecting'

  return (
    <section
      className={cx('overflow-hidden bg-ink', fullscreen ? 'fixed inset-0 z-[60]' : 'relative rounded-lg shadow-float')}
      style={fullscreen ? undefined : { width: Math.min(width, maxWidth()), aspectRatio: '16 / 9' }}
    >
      {failed ? (
        <div className="absolute inset-0 grid place-items-center text-center text-xs text-surface/80">
          <div>
            <p>Camera not available.</p>
            <button type="button" className="mt-2 rounded-full bg-surface/15 px-3 py-1 hover:bg-surface/25" onClick={retry}>
              Try again
            </button>
          </div>
        </div>
      ) : (
        <img
          key={nonce}
          src={robotCameraStreamUrl(robotId, nonce)}
          alt="Robot camera"
          draggable={false}
          className="absolute inset-0 size-full object-contain select-none"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}

      {/* Overlay bar: status and controls, readable over any picture */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-ink/70 to-transparent px-2 py-1.5 text-xs text-surface">
        <span className={cx('flex items-center gap-1.5', !fullscreen && 'pl-4')}>
          <span className={cx('size-2 rounded-full', failed ? 'bg-red' : loaded ? 'bg-green' : 'bg-amber')} />
          Camera · {status}
        </span>
        <span className="flex items-center gap-0.5">
          <OverlayButton icon="refresh" label="Reconnect camera" onClick={retry} />
          <OverlayButton
            icon={fullscreen ? 'close' : 'fit'}
            label={fullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
            onClick={() => setFullscreen(!fullscreen)}
          />
          {!fullscreen ? <OverlayButton icon="minus" label="Hide camera" onClick={() => setHidden(true)} /> : null}
        </span>
      </div>

      {/* Resize grip: top-left corner (the frame is anchored bottom-right) */}
      {!fullscreen ? (
        <div
          role="separator"
          aria-label="Resize camera"
          title="Drag to resize"
          className="absolute top-0 left-0 size-5 cursor-nwse-resize touch-none"
          onPointerDown={startResize}
          onPointerMove={resize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
        >
          <svg viewBox="0 0 12 12" className="m-1 size-3 text-surface/80" aria-hidden="true">
            <path d="M1 7V1h6M1 11 11 1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      ) : null}
    </section>
  )
}

function OverlayButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid size-7 place-items-center rounded-full hover:bg-surface/20"
      onClick={onClick}
    >
      <Icon name={icon} size={14} />
    </button>
  )
}

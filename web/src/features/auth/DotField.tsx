import { useEffect, useRef } from 'react'

const GAP = 26
const REACH = 190

/** `#2d88ff` + 0.5 → `rgb(45 136 255 / 0.5)`. */
function withAlpha(hex: string, alpha: number) {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return `rgb(${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255} / ${alpha})`
}

/**
 * The sign-in backdrop: the dot grid of the warehouse map, with the dots near the pointer lifting and turning blue.
 * While the pointer is away a single point patrols the grid, like a Robot crossing the floor.
 */
export function DotField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let frame = 0
    let pointer: { x: number; y: number } | null = null

    function resize() {
      const ratio = window.devicePixelRatio || 1
      width = canvas!.clientWidth
      height = canvas!.clientHeight
      canvas!.width = width * ratio
      canvas!.height = height * ratio
      context!.setTransform(ratio, 0, 0, ratio, 0, 0)
    }

    function draw(time: number) {
      context!.clearRect(0, 0, width, height)
      // The resting dot is a quiet grey of the current theme; the accent only shows where the focus pushes dots aside.
      const styles = getComputedStyle(document.documentElement)
      const rest = styles.getPropertyValue('--color-container-higher').trim() || '#4e4f50'
      const accent = styles.getPropertyValue('--color-blue').trim() || '#2d88ff'
      // The patrol follows a slow figure of eight around the centre of the page.
      const focus = pointer ?? {
        x: width / 2 + Math.sin(time / 4200) * width * 0.34,
        y: height / 2 + Math.sin(time / 2100) * height * 0.24,
      }
      for (let y = GAP / 2; y < height; y += GAP) {
        for (let x = GAP / 2; x < width; x += GAP) {
          const distance = Math.hypot(x - focus.x, y - focus.y)
          const pull = still ? 0 : Math.max(0, 1 - distance / REACH) ** 2
          // Dots move away from the focus point, as if it pushed them aside.
          const shift = pull * 9
          const angle = Math.atan2(y - focus.y, x - focus.x)
          context!.beginPath()
          context!.arc(x + Math.cos(angle) * shift, y + Math.sin(angle) * shift, 1.25 + pull * 1.9, 0, Math.PI * 2)
          context!.fillStyle = pull > 0.02 ? withAlpha(accent, 0.25 + pull * 0.75) : rest
          context!.fill()
        }
      }
      if (!still) frame = requestAnimationFrame(draw)
    }

    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }
    const onLeave = () => {
      pointer = null
    }
    const onResize = () => {
      resize()
      if (still) draw(0)
    }

    resize()
    frame = requestAnimationFrame(draw)
    // A still field (reduced motion) is drawn once, so it must redraw itself when the theme is switched.
    const themeWatcher = new MutationObserver(() => {
      if (still) draw(0)
    })
    themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onMove)
    document.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(frame)
      themeWatcher.disconnect()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden="true" />
}

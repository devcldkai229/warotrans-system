import { useEffect, useRef } from 'react'
import type { MappingPose } from '@/shared/api/mapping'
import { gridToRgba, worldToPixel, type MappingGrid } from './mappingGrid'

interface MappingCanvasProps {
  grid: MappingGrid | null
  pose: MappingPose | null
  trail: MappingPose[]
}

const ROBOT = '#1f6feb'
const TRAIL = 'rgba(31, 111, 235, 0.45)'

/**
 * The map being built, scaled to fit, with the robot (arrow = heading) and the way it drove. Redrawn when the grid or
 * the pose changes; the grid image itself is rebuilt only when a new grid arrives.
 */
export function MappingCanvas({ grid, pose, trail }: MappingCanvasProps) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const image = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!grid) {
      image.current = null
      return
    }
    const off = document.createElement('canvas')
    off.width = grid.width
    off.height = grid.height
    const ctx = off.getContext('2d')
    if (!ctx) return
    ctx.putImageData(new ImageData(gridToRgba(grid), grid.width, grid.height), 0, 0)
    image.current = off
  }, [grid])

  useEffect(() => {
    const el = canvas.current
    const container = box.current
    if (!el || !container) return
    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const w = container.clientWidth
      const h = container.clientHeight
      el.width = Math.round(w * dpr)
      el.height = Math.round(h * dpr)
      el.style.width = `${w}px`
      el.style.height = `${h}px`
      const ctx = el.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (!grid || !image.current) return

      const scale = Math.min((w - 32) / grid.width, (h - 32) / grid.height)
      const ox = (w - grid.width * scale) / 2
      const oy = (h - grid.height * scale) / 2
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(image.current, ox, oy, grid.width * scale, grid.height * scale)
      const toScreen = (x: number, y: number) => {
        const p = worldToPixel(grid, x, y)
        return [ox + p.col * scale, oy + p.row * scale] as const
      }

      if (trail.length > 1) {
        ctx.strokeStyle = TRAIL
        ctx.lineWidth = 2
        ctx.beginPath()
        trail.forEach((p, i) => {
          const [sx, sy] = toScreen(p.x, p.y)
          if (i === 0) ctx.moveTo(sx, sy)
          else ctx.lineTo(sx, sy)
        })
        ctx.stroke()
      }

      if (pose) {
        const [sx, sy] = toScreen(pose.x, pose.y)
        const size = Math.max(9, 0.18 / grid.resolution * scale)
        ctx.save()
        ctx.translate(sx, sy)
        ctx.rotate(-pose.yaw) // map yaw is counter-clockwise, screen y points down
        ctx.fillStyle = ROBOT
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(size, 0)
        ctx.lineTo(-size * 0.7, size * 0.65)
        ctx.lineTo(-size * 0.35, 0)
        ctx.lineTo(-size * 0.7, -size * 0.65)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(container)
    return () => observer.disconnect()
  }, [grid, pose, trail])

  return (
    <div ref={box} className="absolute inset-0">
      <canvas ref={canvas} className="block" />
    </div>
  )
}

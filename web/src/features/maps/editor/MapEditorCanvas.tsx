import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import type { Edge, Endpoint, Point, Zone } from '@/shared/api/contracts'
import { cx } from '@/shared/lib/cx'
import { Icon } from '@/shared/ui/Icon'
import { lineStringToPoints, polygonToPoints } from '@/shared/map/geoJson'
import {
  pixelToWorld,
  worldToPixel,
  type MapTransformParams,
  type PixelCoord,
  type WorldCoord,
} from '@/shared/map/mapCoordinateTransform'

export type EditorTool = 'select' | 'pan' | 'endpoint' | 'edge' | 'zone'

export interface MapEditorCanvasProps {
  transform: MapTransformParams & { imageWidthPixels: number; frameId?: string }
  previewUrl: string | null
  endpoints: Endpoint[]
  edges: Edge[]
  zones: Zone[]
  selected?: { endpointId?: string; edgeId?: string; zoneId?: string }
  tool: EditorTool
  readOnly?: boolean
  draftWorldPoints?: Point[]
  draftKind?: 'edge' | 'zone' | null
  onWorldClick?: (world: WorldCoord, image: PixelCoord) => void
  onWorldDoubleClick?: (world: WorldCoord, image: PixelCoord) => void
  onEndpointClick?: (id: string) => void
  onEdgeClick?: (id: string) => void
  onZoneClick?: (id: string) => void
  className?: string
  children?: ReactNode
}

function polyline(points: PixelCoord[]): string {
  return points.map((p) => `${p.u},${p.v}`).join(' ')
}

export function MapEditorCanvas({
  transform,
  previewUrl,
  endpoints,
  edges,
  zones,
  selected = {},
  tool,
  readOnly = false,
  draftWorldPoints = [],
  draftKind = null,
  onWorldClick,
  onWorldDoubleClick,
  onEndpointClick,
  onEdgeClick,
  onZoneClick,
  className,
  children,
}: MapEditorCanvasProps) {
  const { imageWidthPixels: W, imageHeightPixels: H, resolution, originYaw, frameId = 'map' } = transform
  const svgRef = useRef<SVGSVGElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [cursor, setCursor] = useState<{ image: PixelCoord; world: WorldCoord } | null>(null)
  const dragged = useRef(false)
  // Screen px per image px at zoom 1 (the SVG is fitted into its box). A small PGM (e.g. 82 x 103 px for a
  // 3.5 x 4.55 m floor) is drawn ~5x larger, so marks sized in image px would cover the whole floor.
  const [fitScale, setFitScale] = useState(1)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const update = () => {
      const scale = Math.min(svg.clientWidth / W, svg.clientHeight / H)
      if (Number.isFinite(scale) && scale > 0) setFitScale(scale)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [W, H])

  // Fleet-manager style (OTTO): places are small fixed-size dots on screen whatever the map size or zoom.
  const px = (screenPixels: number) => screenPixels / (fitScale * zoom)

  const toImage = useCallback(
    (clientX: number, clientY: number): PixelCoord | null => {
      const svg = svgRef.current
      if (!svg) return null
      const ctm = svg.getScreenCTM()
      if (!ctm) return null
      const pt = svg.createSVGPoint()
      pt.x = clientX
      pt.y = clientY
      const local = pt.matrixTransform(ctm.inverse())
      return { u: local.x, v: local.y }
    },
    [],
  )

  const draftPixels = useMemo(
    () => draftWorldPoints.map((p) => worldToPixel(transform, p)),
    [draftWorldPoints, transform],
  )

  function changeZoom(next: number) {
    const clamped = Math.min(8, Math.max(0.25, next))
    setZoom(clamped)
    if (Math.abs(clamped - 1) < 1e-6) setPan({ x: 0, y: 0 })
  }

  function resetView() {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  function startPan(event: ReactPointerEvent) {
    dragged.current = false
    const panning = tool === 'pan' || event.button === 1 || (event.button === 0 && event.altKey)
    if (!panning) return
    event.preventDefault()
    const start = { x: event.clientX - pan.x, y: event.clientY - pan.y }
    const startX = event.clientX
    const startY = event.clientY
    const move = (moveEvent: PointerEvent) => {
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 4) dragged.current = true
      if (dragged.current) setPan({ x: moveEvent.clientX - start.x, y: moveEvent.clientY - start.y })
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  function emitClick(clientX: number, clientY: number, double: boolean) {
    if (dragged.current || readOnly) return
    const image = toImage(clientX, clientY)
    if (!image) return
    const world = pixelToWorld(transform, image)
    if (double) onWorldDoubleClick?.(world, image)
    else onWorldClick?.(world, image)
  }

  // Image Y down; world yaw CCW from +X. Arrow angle in SVG: -(yaw + originYaw).
  const headingDeg = (yawRad: number) => (-(yawRad + originYaw) * 180) / Math.PI

  return (
    <div className={cx('relative size-full overflow-hidden bg-container', className)}>
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center' }}
      >
        <svg
          ref={svgRef}
          className="max-h-full max-w-full touch-none select-none"
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={startPan}
          onPointerMove={(event) => {
            const image = toImage(event.clientX, event.clientY)
            if (!image) return
            setCursor({ image, world: pixelToWorld(transform, image) })
          }}
          onPointerLeave={() => setCursor(null)}
          onClick={(event) => emitClick(event.clientX, event.clientY, false)}
          onDoubleClick={(event) => {
            event.preventDefault()
            emitClick(event.clientX, event.clientY, true)
          }}
          style={{
            cursor: tool === 'pan' ? 'grab' : readOnly ? 'default' : 'crosshair',
          }}
        >
          <rect x={0} y={0} width={W} height={H} fill="#1a1a1a" />
          {previewUrl ? (
            <image href={previewUrl} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
          ) : null}

          {zones.map((zone) => {
            const pts = polygonToPoints(zone.geometry).map((p) => worldToPixel(transform, p))
            const isSel = selected.zoneId === zone.id
            return (
              <polygon
                key={zone.id}
                points={polyline(pts)}
                fill={isSel ? 'rgba(59,130,246,0.28)' : 'rgba(234,179,8,0.18)'}
                stroke={isSel ? '#2563eb' : '#ca8a04'}
                strokeWidth={isSel ? 2 / zoom : 1 / zoom}
                vectorEffect="non-scaling-stroke"
                onClick={(e) => {
                  e.stopPropagation()
                  onZoneClick?.(zone.id)
                }}
              />
            )
          })}

          {edges.map((edge) => {
            const pts = lineStringToPoints(edge.geometry).map((p) => worldToPixel(transform, p))
            const isSel = selected.edgeId === edge.id
            const widthPx = Math.max(1, (edge.widthMeters ?? 1) / resolution)
            return (
              <g
                key={edge.id}
                onClick={(e) => {
                  e.stopPropagation()
                  onEdgeClick?.(edge.id)
                }}
              >
                <polyline
                  points={polyline(pts)}
                  fill="none"
                  stroke={isSel ? 'rgba(37,99,235,0.35)' : 'rgba(100,116,139,0.35)'}
                  strokeWidth={widthPx}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={polyline(pts)}
                  fill="none"
                  stroke={isSel ? '#2563eb' : '#334155'}
                  strokeWidth={isSel ? 2 / zoom : 1.25 / zoom}
                  vectorEffect="non-scaling-stroke"
                  markerEnd={edge.direction === 'ONE_WAY' ? 'url(#edge-arrow)' : undefined}
                />
              </g>
            )
          })}

          {endpoints.map((ep) => {
            const at = worldToPixel(transform, { x: ep.x, y: ep.y })
            const isSel = selected.endpointId === ep.id
            const color = isSel ? '#2563eb' : '#0f172a'
            return (
              <g
                key={ep.id}
                transform={`translate(${at.u} ${at.v})`}
                onClick={(e) => {
                  e.stopPropagation()
                  onEndpointClick?.(ep.id)
                }}
                style={{ cursor: 'pointer' }}
              >
                {/* invisible hit area: the dot is small, the click target is not */}
                <circle r={px(9)} fill="transparent" />
                <line
                  x1={0}
                  y1={0}
                  x2={px(11)}
                  y2={0}
                  stroke={isSel ? '#2563eb' : '#f59e0b'}
                  strokeWidth={px(2)}
                  strokeLinecap="round"
                  transform={`rotate(${headingDeg(ep.yaw)})`}
                />
                <circle r={px(isSel ? 5 : 4)} fill={color} stroke="#fff" strokeWidth={px(1.5)} />
                <text
                  y={px(15)}
                  textAnchor="middle"
                  fontSize={px(10)}
                  fontWeight={600}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={px(3)}
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {ep.name}
                </text>
              </g>
            )
          })}

          {draftPixels.length > 0 && draftKind ? (
            draftKind === 'zone' && draftPixels.length >= 2 ? (
              <polygon
                points={polyline(draftPixels)}
                fill="rgba(37,99,235,0.15)"
                stroke="#2563eb"
                strokeWidth={1.5 / zoom}
                strokeDasharray={`${6 / zoom} ${4 / zoom}`}
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <polyline
                points={polyline(draftPixels)}
                fill="none"
                stroke="#2563eb"
                strokeWidth={1.5 / zoom}
                strokeDasharray={`${6 / zoom} ${4 / zoom}`}
                vectorEffect="non-scaling-stroke"
              />
            )
          ) : null}
          {draftPixels.map((p, i) => (
            <circle key={`d-${i}`} cx={p.u} cy={p.v} r={px(3)} fill="#2563eb" />
          ))}

          <defs>
            <marker id="edge-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M1 1 9 5 1 9Z" fill="#334155" />
            </marker>
          </defs>
        </svg>
      </div>

      <div className="absolute right-3 bottom-3 z-10 flex flex-col gap-1 rounded-full bg-surface p-1 shadow-float">
        <button type="button" className="grid size-8 place-items-center rounded-full hover:bg-container-high" onClick={() => changeZoom(zoom * 1.25)} aria-label="Zoom in">
          <Icon name="plus" size={14} />
        </button>
        <button type="button" className="grid size-8 place-items-center rounded-full hover:bg-container-high" onClick={() => changeZoom(zoom / 1.25)} aria-label="Zoom out">
          <Icon name="minus" size={14} />
        </button>
        <button type="button" className="grid size-8 place-items-center rounded-full hover:bg-container-high" onClick={resetView} aria-label="Reset view">
          <Icon name="refresh" size={14} />
        </button>
      </div>

      {import.meta.env.DEV && cursor ? (
        <div className="absolute bottom-3 left-3 z-10 rounded-md bg-surface/95 px-3 py-2 font-mono text-[11px] text-ink-2 shadow-float">
          <div>
            Image u={cursor.image.u.toFixed(2)} v={cursor.image.v.toFixed(2)}
          </div>
          <div>
            World x={cursor.world.x.toFixed(3)} m · y={cursor.world.y.toFixed(3)} m
          </div>
          <div>Frame = {frameId}</div>
        </div>
      ) : null}

      {children}
    </div>
  )
}

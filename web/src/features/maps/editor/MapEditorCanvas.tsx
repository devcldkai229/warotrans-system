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
import { MAP_CARD, MAP_HALO, MAP_IMAGE_FILTER, MAP_PAPER } from '@/shared/map/mapStyle'
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
  /** A vertex of the selected edge or zone was dragged to a new place; `points` is the whole new outline. */
  onShapeVerticesChange?: (shape: { kind: 'edge' | 'zone'; id: string }, points: Point[]) => void
  /** The selected endpoint was dragged to a new place (not saved: the page keeps it as an unsaved edit). */
  onEndpointMove?: (id: string, at: Point) => void
  /** The endpoint being placed (not saved yet): drawn as a marker with its heading, `yaw` in radians. */
  pendingEndpoint?: { at: Point; yaw: number } | null
  /** The pending endpoint's marker was dragged to a new place. */
  onPendingEndpointMove?: (at: Point) => void
  className?: string
  children?: ReactNode
}

function polyline(points: PixelCoord[]): string {
  return points.map((p) => `${p.u},${p.v}`).join(' ')
}

function pointInPolygon(point: Point, ring: Point[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

const SHIFT_SNAP_STEP = Math.PI / 4

// Shift while drawing: put `to` on the nearest 45° ray from `from` (horizontal, vertical or diagonal on screen).
// The point is projected onto that ray, so it stays as far along it as the pointer is.
function constrainTo45(from: PixelCoord, to: PixelCoord): PixelCoord {
  const du = to.u - from.u
  const dv = to.v - from.v
  const angle = Math.round(Math.atan2(dv, du) / SHIFT_SNAP_STEP) * SHIFT_SNAP_STEP
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const length = du * cos + dv * sin
  return { u: from.u + length * cos, v: from.v + length * sin }
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
  onShapeVerticesChange,
  onEndpointMove,
  pendingEndpoint = null,
  onPendingEndpointMove,
  className,
  children,
}: MapEditorCanvasProps) {
  const { imageWidthPixels: W, imageHeightPixels: H, resolution, originYaw, frameId = 'map' } = transform
  const svgRef = useRef<SVGSVGElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [cursor, setCursor] = useState<{ image: PixelCoord; world: WorldCoord } | null>(null)
  const [shiftHeld, setShiftHeld] = useState(false)
  // A vertex of the selected edge/zone being dragged: only that vertex moves, every other one stays where it is.
  const [vertexDrag, setVertexDrag] = useState<{
    kind: 'edge' | 'zone'
    id: string
    index: number
    image: PixelCoord
  } | null>(null)
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

  // Tracked on the window so the preview follows Shift even when the pointer is not moving.
  useEffect(() => {
    const sync = (event: KeyboardEvent) => setShiftHeld(event.shiftKey)
    const release = () => setShiftHeld(false)
    window.addEventListener('keydown', sync)
    window.addEventListener('keyup', sync)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', sync)
      window.removeEventListener('keyup', sync)
      window.removeEventListener('blur', release)
    }
  }, [])

  // The last drawn point is where the next segment starts; Shift only applies once there is one.
  const lastDraftPixel = draftKind ? draftPixels[draftPixels.length - 1] : undefined
  const aim = (image: PixelCoord, shift: boolean): PixelCoord =>
    shift && lastDraftPixel ? constrainTo45(lastDraftPixel, image) : image
  const aimedImage = cursor ? aim(cursor.image, shiftHeld) : null
  const aimedWorld = aimedImage ? pixelToWorld(transform, aimedImage) : null

  // Outline in image pixels, with the vertex being dragged shown at the pointer instead of where it was saved.
  function outlinePixels(kind: 'edge' | 'zone', id: string, world: Point[]): PixelCoord[] {
    return world.map((p, i) =>
      vertexDrag && vertexDrag.kind === kind && vertexDrag.id === id && vertexDrag.index === i
        ? vertexDrag.image
        : worldToPixel(transform, p),
    )
  }

  function startVertexDrag(
    event: ReactPointerEvent,
    kind: 'edge' | 'zone',
    id: string,
    index: number,
    world: Point[],
  ) {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    dragged.current = false
    const pixels = world.map((p) => worldToPixel(transform, p))
    // Shift locks the dragged vertex to a 45° ray from the neighbour before it (the one after it for an edge's first
    // vertex); that neighbour and every other vertex stay fixed.
    const anchor =
      kind === 'zone' ? pixels[(index - 1 + pixels.length) % pixels.length] : index > 0 ? pixels[index - 1] : pixels[1]
    const startX = event.clientX
    const startY = event.clientY
    let latest: PixelCoord | null = null
    const move = (moveEvent: PointerEvent) => {
      if (!dragged.current && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) <= 4) return
      dragged.current = true
      const raw = toImage(moveEvent.clientX, moveEvent.clientY)
      if (!raw) return
      latest = moveEvent.shiftKey && anchor ? constrainTo45(anchor, raw) : raw
      setVertexDrag({ kind, id, index, image: latest })
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      setVertexDrag(null)
      if (!dragged.current || !latest) return
      const moved = pixelToWorld(transform, latest)
      onShapeVerticesChange?.({ kind, id }, world.map((p, i) => (i === index ? { x: moved.x, y: moved.y } : p)))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  // Zones may overlap and the top one takes the click, so a zone underneath could never be picked. Clicking the same
  // spot again walks down through every zone there (top first, then back to the top).
  const [zoneStack, setZoneStack] = useState<{ zoneId: string; position: number; count: number } | null>(null)
  function pickZoneAt(clientX: number, clientY: number, hitId: string): string {
    const image = toImage(clientX, clientY)
    if (!image) return hitId
    const world = pixelToWorld(transform, image)
    // `zones` is in drawing order, so the last one is the one on top.
    const stack = zones.filter((z) => pointInPolygon(world, polygonToPoints(z.geometry))).reverse()
    if (stack.length === 0) return hitId
    const current = stack.findIndex((z) => z.id === selected.zoneId)
    const position = current === -1 ? 0 : (current + 1) % stack.length
    const picked = stack[position].id
    setZoneStack(stack.length > 1 ? { zoneId: picked, position: position + 1, count: stack.length } : null)
    return picked
  }

  // Drags a point marker (the endpoint being placed, or the selected endpoint) and reports where it is as it moves.
  function startPointDrag(event: ReactPointerEvent, onMove: ((at: Point) => void) | undefined) {
    if (event.button !== 0 || readOnly) return
    event.stopPropagation()
    event.preventDefault()
    dragged.current = false
    const startX = event.clientX
    const startY = event.clientY
    const move = (moveEvent: PointerEvent) => {
      if (!dragged.current && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) <= 4) return
      dragged.current = true
      const image = toImage(moveEvent.clientX, moveEvent.clientY)
      if (image) onMove?.(pixelToWorld(transform, image))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const vertexEditable = !readOnly && tool === 'select' && !draftKind
  const editedEdge = vertexEditable ? edges.find((e) => e.id === selected.edgeId) : undefined
  const editedZone = vertexEditable && !editedEdge ? zones.find((z) => z.id === selected.zoneId) : undefined
  const vertexShape = editedEdge
    ? { kind: 'edge' as const, id: editedEdge.id, world: lineStringToPoints(editedEdge.geometry) }
    : editedZone
      ? { kind: 'zone' as const, id: editedZone.id, world: polygonToPoints(editedZone.geometry) }
      : null

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

  function emitClick(clientX: number, clientY: number, double: boolean, shift: boolean) {
    if (dragged.current || readOnly) return
    const rawImage = toImage(clientX, clientY)
    if (!rawImage) return
    const image = aim(rawImage, shift)
    const world = pixelToWorld(transform, image)
    if (double) onWorldDoubleClick?.(world, image)
    else onWorldClick?.(world, image)
  }

  // Zones and edges are only selectable with the Select or Pan tool. With a creation tool (Endpoint, Edge, Zone) the
  // click belongs to the map, so a point can be placed inside a zone or on a lane instead of opening that shape.
  const shapesSelectable = tool === 'select' || tool === 'pan'

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
          onClick={(event) => emitClick(event.clientX, event.clientY, false, event.shiftKey)}
          onDoubleClick={(event) => {
            event.preventDefault()
            emitClick(event.clientX, event.clientY, true, event.shiftKey)
          }}
          style={{
            cursor: tool === 'pan' ? 'grab' : readOnly ? 'default' : 'crosshair',
          }}
        >
          <rect x={0} y={0} width={W} height={H} fill={MAP_PAPER} />
          {previewUrl ? (
            <image href={previewUrl} x={0} y={0} width={W} height={H} preserveAspectRatio="none" style={{ filter: MAP_IMAGE_FILTER }} />
          ) : null}

          {/* the selected zone is drawn last so it stays visible when another zone covers it */}
          {[...zones.filter((z) => z.id !== selected.zoneId), ...zones.filter((z) => z.id === selected.zoneId)].map((zone) => {
            const pts = outlinePixels('zone', zone.id, polygonToPoints(zone.geometry))
            const isSel = selected.zoneId === zone.id
            return (
              <polygon
                key={zone.id}
                points={polyline(pts)}
                fill={isSel ? 'rgba(45,136,255,0.28)' : 'rgba(247,185,40,0.18)'}
                stroke={isSel ? '#2d88ff' : '#f7b928'}
                strokeWidth={isSel ? 2 / zoom : 1 / zoom}
                vectorEffect="non-scaling-stroke"
                onClick={
                  shapesSelectable
                    ? (e) => {
                        e.stopPropagation()
                        onZoneClick?.(pickZoneAt(e.clientX, e.clientY, zone.id))
                      }
                    : undefined
                }
              />
            )
          })}

          {edges.map((edge) => {
            const pts = outlinePixels('edge', edge.id, lineStringToPoints(edge.geometry))
            const isSel = selected.edgeId === edge.id
            const widthPx = Math.max(1, (edge.widthMeters ?? 1) / resolution)
            return (
              <g
                key={edge.id}
                onClick={
                  shapesSelectable
                    ? (e) => {
                        e.stopPropagation()
                        onEdgeClick?.(edge.id)
                      }
                    : undefined
                }
              >
                <polyline
                  points={polyline(pts)}
                  fill="none"
                  stroke={isSel ? 'rgba(45,136,255,0.35)' : 'rgba(176,179,184,0.35)'}
                  strokeWidth={widthPx}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={polyline(pts)}
                  fill="none"
                  stroke={isSel ? '#2d88ff' : 'var(--color-ink-2)'}
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
            const color = isSel ? '#2d88ff' : 'var(--color-ink)'
            return (
              <g
                key={ep.id}
                transform={`translate(${at.u} ${at.v})`}
                onPointerDown={
                  isSel && tool === 'select' && onEndpointMove
                    ? (e) => startPointDrag(e, (at) => onEndpointMove(ep.id, at))
                    : undefined
                }
                onClick={(e) => {
                  e.stopPropagation()
                  // the click that ends a drag must not re-select the endpoint, that would drop the unsaved move
                  if (dragged.current) return
                  onEndpointClick?.(ep.id)
                }}
                style={{ cursor: isSel && tool === 'select' && onEndpointMove ? 'move' : 'pointer' }}
              >
                {/* invisible hit area: the dot is small, the click target is not */}
                <circle r={px(9)} fill="transparent" />
                <line
                  x1={0}
                  y1={0}
                  x2={px(11)}
                  y2={0}
                  stroke={isSel ? '#2d88ff' : '#f59e0b'}
                  strokeWidth={px(2)}
                  strokeLinecap="round"
                  transform={`rotate(${headingDeg(ep.yaw)})`}
                />
                <circle r={px(isSel ? 5 : 4)} fill={color} stroke={MAP_HALO} strokeWidth={px(1.5)} />
                <text
                  y={px(15)}
                  textAnchor="middle"
                  fontSize={px(10)}
                  fontWeight={600}
                  fill={color}
                  stroke={MAP_HALO}
                  strokeWidth={px(3)}
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {ep.name}
                </text>
              </g>
            )
          })}

          {pendingEndpoint
            ? (() => {
                const at = worldToPixel(transform, pendingEndpoint.at)
                return (
                  <g
                    transform={`translate(${at.u} ${at.v})`}
                    style={{ cursor: readOnly ? 'default' : 'move' }}
                    onPointerDown={(e) => startPointDrag(e, onPendingEndpointMove)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <circle r={px(14)} fill="rgba(45,136,255,0.12)" stroke="#2d88ff" strokeWidth={px(1.25)} strokeDasharray={`${px(4)} ${px(3)}`} />
                    <line
                      x1={0}
                      y1={0}
                      x2={px(20)}
                      y2={0}
                      stroke="#2d88ff"
                      strokeWidth={px(2.5)}
                      strokeLinecap="round"
                      transform={`rotate(${headingDeg(pendingEndpoint.yaw)})`}
                    />
                    <circle r={px(5.5)} fill="#2d88ff" stroke={MAP_HALO} strokeWidth={px(1.75)} />
                  </g>
                )
              })()
            : null}

          {vertexShape
            ? outlinePixels(vertexShape.kind, vertexShape.id, vertexShape.world).map((p, i) => (
                <g
                  key={`v-${i}`}
                  transform={`translate(${p.u} ${p.v})`}
                  style={{ cursor: 'move' }}
                  onPointerDown={(e) => startVertexDrag(e, vertexShape.kind, vertexShape.id, i, vertexShape.world)}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* invisible hit area: the handle is small, the grab target is not */}
                  <circle r={px(9)} fill="transparent" />
                  <circle r={px(4.5)} fill={MAP_CARD} stroke="#2d88ff" strokeWidth={px(1.75)} />
                </g>
              ))
            : null}

          {draftPixels.length > 0 && draftKind ? (
            draftKind === 'zone' && draftPixels.length >= 2 ? (
              <polygon
                points={polyline(draftPixels)}
                fill="rgba(45,136,255,0.15)"
                stroke="#2d88ff"
                strokeWidth={1.5 / zoom}
                strokeDasharray={`${6 / zoom} ${4 / zoom}`}
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <polyline
                points={polyline(draftPixels)}
                fill="none"
                stroke="#2d88ff"
                strokeWidth={1.5 / zoom}
                strokeDasharray={`${6 / zoom} ${4 / zoom}`}
                vectorEffect="non-scaling-stroke"
              />
            )
          ) : null}
          {lastDraftPixel && aimedImage && !readOnly ? (
            <line
              x1={lastDraftPixel.u}
              y1={lastDraftPixel.v}
              x2={aimedImage.u}
              y2={aimedImage.v}
              stroke="#2d88ff"
              strokeOpacity={shiftHeld ? 1 : 0.55}
              strokeWidth={1.5 / zoom}
              strokeDasharray={shiftHeld ? undefined : `${6 / zoom} ${4 / zoom}`}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          ) : null}
          {draftPixels.map((p, i) => (
            <circle key={`d-${i}`} cx={p.u} cy={p.v} r={px(3)} fill="#2d88ff" />
          ))}

          <defs>
            <marker id="edge-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M1 1 9 5 1 9Z" fill="#b0b3b8" />
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

      {zoneStack && selected.zoneId === zoneStack.zoneId && tool === 'select' ? (
        <div className="pointer-events-none absolute bottom-14 left-1/2 z-10 -translate-x-1/2 rounded-full bg-surface/95 px-3 py-1.5 text-xs text-ink-2 shadow-float">
          Zone {zoneStack.position} of {zoneStack.count} here. Click again for the next one
        </div>
      ) : null}

      {(draftKind && !readOnly) || vertexShape ? (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-surface/95 px-3 py-1.5 text-xs text-ink-2 shadow-float">
          {vertexShape ? 'Drag a point to move it. ' : null}Hold{' '}
          <kbd className="rounded bg-container-high px-1 font-mono">Shift</kbd> to keep the line straight (45° steps)
        </div>
      ) : null}

      {import.meta.env.DEV && aimedImage && aimedWorld ? (
        <div className="absolute bottom-3 left-3 z-10 rounded-md bg-surface/95 px-3 py-2 font-mono text-[11px] text-ink-2 shadow-float">
          <div>
            Image u={aimedImage.u.toFixed(2)} v={aimedImage.v.toFixed(2)}
          </div>
          <div>
            World x={aimedWorld.x.toFixed(3)} m · y={aimedWorld.y.toFixed(3)} m
          </div>
          <div>Frame = {frameId}</div>
        </div>
      ) : null}

      {children}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { Edge, EdgeDirection, Endpoint, Point, RobotStatus, Zone } from '@/shared/api/contracts'
import { cx } from '@/shared/lib/cx'
import { DEFAULT_MAP_BOUNDS, type MapBounds } from '@/shared/lib/mapView'
import { Icon } from '@/shared/ui/Icon'
import { humanize } from '@/shared/lib/format'
import { MapGlyph } from './MapGlyph'
import {
  EDGE_COLOR,
  ENDPOINT_COLOR,
  ENDPOINT_NAME,
  LANE_BAND_OPACITY,
  LANE_CHEVRON_OPACITY,
  MAP_AMBER,
  MAP_CARD,
  MAP_HALO,
  MAP_IMAGE_FILTER,
  MAP_INK,
  MAP_LINE,
  MAP_OFF,
  MAP_PAPER,
  MAP_RED,
  ROBOT_COLOR,
  ZONE_COLOR,
  ZONE_FILL_OPACITY,
  ZONE_LABEL,
  ZONE_ORDER,
  toPercent,
  zoneSwatchStyle,
} from './mapStyle'
import { lineStringToPoints, polygonToPoints } from './geoJson'
import { CHEVRON_PATH, laneGlyphs } from './laneGlyphs'
import { SCENE_EDGES, SCENE_ENDPOINTS, SCENE_ZONES, distanceToPolyline, pointInPolygon } from './scene'

/** A Robot as the map draws it: pose from fleet.robots, status for the colour. */
export interface MapRobot {
  code: string
  status: RobotStatus
  x: number
  y: number
  yaw: number
  /** Ring the Robot (an error or a blocked Zone). */
  alert?: boolean
}

export interface MapCallout {
  x: number
  y: number
  lines: string[]
  tone?: 'dark' | 'warn' | 'danger'
}

/** A planned Container move: where it is picked up and where it must go (a TransportRequestDetail line). */
export interface MapMovement {
  from: Point
  to: Point
  sequence?: number
  label?: string
}

/** Traffic coordinator overlay (authorized edges + quarantine markers). */
export interface MapTrafficOverlay {
  /** Graph edge numeric ids currently under motion authority. */
  authorizedEdgeIds?: number[]
  /** Resource ids that are full / held (bay:CODE, corridor ids). */
  occupiedResourceIds?: string[]
  /** Robots in Quarantined phase — drawn as alert markers. */
  quarantinedRobotCodes?: string[]
}

export type MapEmphasis = 'zones' | 'edges' | 'endpoints'

interface MapLayers {
  zones?: boolean
  edges?: boolean
  endpoints?: boolean
  robots?: boolean
  /** Count Robots inside each Zone and on each Edge against its capacity (the in-memory TrafficCoordinator view). */
  occupancy?: boolean
  /** Show the floating Guide panel. */
  legend?: boolean
  /** Start with the Guide expanded (wide maps); small panes keep it folded. */
  legendOpen?: boolean
  controls?: boolean
  coordinates?: boolean
}

export interface WarehouseMapProps {
  zones?: Zone[]
  edges?: Edge[]
  endpoints?: Endpoint[]
  bounds?: MapBounds
  robots?: MapRobot[]
  layers?: MapLayers
  /** Which Endpoint names are written on the map: none, only the focused ones, or all. */
  labels?: 'none' | 'focus' | 'all'
  /** Editor: the layers the current tool works on; the others fade back. */
  emphasis?: MapEmphasis[]
  /** Pixels on the right that panels cover: the zoom controls and Guide stay clear of them without moving the map. */
  uiInset?: number
  focusEndpointIds?: string[]
  /** When given, every other Robot fades back. */
  focusRobotCodes?: string[]
  movements?: MapMovement[]
  trafficOverlay?: MapTrafficOverlay | null
  callouts?: MapCallout[]
  selected?: { zoneId?: string; edgeId?: string; endpointId?: string; robotCode?: string }
  onRobotClick?: (code: string) => void
  onZoneClick?: (id: string) => void
  onEdgeClick?: (id: string) => void
  onEndpointClick?: (id: string) => void
  /** Click on empty map, in metres. */
  onBackgroundClick?: (point: Point) => void
  /**
   * Unit of Endpoint and Robot `yaw`. Backend data (Navigation endpoints, Fleet pose) is radians (REP-103);
   * the mock scenes are degrees. Defaults to degrees.
   */
  yawUnit?: 'deg' | 'rad'
  /** Controlled zoom (1–4). Omit to let the map keep its own zoom. */
  zoom?: number
  onZoomChange?: (zoom: number) => void
  /** Keep this point (e.g. a Robot) in the centre of the frame while it moves. */
  follow?: Point | null
  /** The user dragged the map (e.g. to stop following). */
  onUserPan?: () => void
  /** Edge being drawn in the editor. */
  drawing?: { points: Point[]; direction: EdgeDirection }
  /** Occupancy preview PNG (MapVersion.previewImageUri), stretched to map bounds. */
  occupancyImageUrl?: string | null
  className?: string
  /** HTML drawn on top of the map: positioned with `toPercent`, inside the same square as the map. */
  children?: ReactNode
}

// A raised dark tooltip; a warning or an alarm is the same tooltip with a ring in the tone.
const CALLOUT_TONE = {
  dark: 'bg-container-higher',
  warn: 'bg-container-higher ring-2 ring-amber',
  danger: 'bg-container-higher ring-2 ring-red',
}

/** Map size (metres) the mark sizes below were designed for (see MAP_BOUNDS in scene.ts). */
const MARK_REFERENCE_METRES = 50

// Map chrome (Guide, zoom, coordinates): floating white cards, the same as panels elsewhere in the console.
const CHROME = 'absolute z-4 bg-surface/95 shadow-float'
const ZOOM_BUTTON =
  'grid size-8 place-items-center rounded-full text-ink-2 transition-colors duration-200 hover:bg-container-high hover:text-ink disabled:pointer-events-none disabled:opacity-35'

/** One map for every screen: an SVG square in metres plus an HTML overlay in the same square. */
export function WarehouseMap({
  zones = SCENE_ZONES,
  edges = SCENE_EDGES,
  endpoints = SCENE_ENDPOINTS,
  bounds = DEFAULT_MAP_BOUNDS,
  robots = [],
  layers = {},
  labels = 'focus',
  emphasis = [],
  uiInset = 0,
  focusEndpointIds = [],
  focusRobotCodes,
  movements = [],
  trafficOverlay = null,
  callouts = [],
  selected = {},
  onRobotClick,
  onZoneClick,
  onEdgeClick,
  onEndpointClick,
  onBackgroundClick,
  yawUnit = 'deg',
  zoom: controlledZoom,
  onZoomChange,
  follow,
  onUserPan,
  drawing,
  occupancyImageUrl,
  className,
  children,
}: WarehouseMapProps) {
  const show = { zones: true, edges: true, endpoints: true, robots: true, legend: true, controls: true, coordinates: true, ...layers }
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  const X = (x: number) => x - bounds.minX
  const Y = (y: number) => bounds.maxY - y
  const stagePoints = (points: Point[]) => points.map((point) => `${X(point.x)},${Y(point.y)}`).join(' ')
  // Marks (robots, endpoints, labels, lanes) are drawn in metres for a ~50 m warehouse. Smaller maps scale
  // them down so they keep the same size on screen instead of covering a 5 m room.
  const mark = Math.min(1, Math.max(width, height) / MARK_REFERENCE_METRES)
  // SVG rotate() takes degrees, clockwise on screen: map yaw is counter-clockwise, hence the minus at use.
  const yawDeg = (yaw: number) => (yawUnit === 'rad' ? (yaw * 180) / Math.PI : yaw)

  const svgRef = useRef<SVGSVGElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [ownZoom, setOwnZoom] = useState(1)
  const zoom = controlledZoom ?? ownZoom
  const setZoom = (next: number) => (onZoomChange ? onZoomChange(next) : setOwnZoom(next))
  const [pan, setPan] = useState({ x: 0, y: 0 })

  // Follow: pan so `follow` sits in the frame centre. The stage is a square of side S (untransformed layout
  // size); the SVG fits the map into it ("meet"), and the stage is scaled about its centre by `zoom`.
  const followX = follow?.x
  const followY = follow?.y
  useEffect(() => {
    if (followX === undefined || followY === undefined) return
    const side = stageRef.current?.offsetWidth ?? 0
    if (side === 0 || width <= 0 || height <= 0) return
    const k = side / Math.max(width, height)
    const localX = (side - width * k) / 2 + (followX - bounds.minX) * k
    const localY = (side - height * k) / 2 + (bounds.maxY - followY) * k
    setPan({ x: -(localX - side / 2) * zoom, y: -(localY - side / 2) * zoom })
  }, [followX, followY, zoom, width, height, bounds.minX, bounds.maxY])
  const [cursor, setCursor] = useState<Point | null>(null)
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null)
  const [hoveredEndpointId, setHoveredEndpointId] = useState<string | null>(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const dragged = useRef(false)

  const toMetres = (clientX: number, clientY: number): Point | null => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    return {
      x: bounds.minX + ((clientX - rect.left) / rect.width) * width,
      y: bounds.maxY - ((clientY - rect.top) / rect.height) * height,
    }
  }

  function startPan(event: ReactPointerEvent) {
    dragged.current = false
    // Chrome and overlay widgets keep their own pointer handling; callouts are see-through.
    if (zoom <= 1 || (event.target as HTMLElement).closest('[data-map-ui], [data-map-overlay] > :not([data-map-tip])')) return
    const start = { x: event.clientX - pan.x, y: event.clientY - pan.y }
    const startX = event.clientX
    const startY = event.clientY
    const move = (moveEvent: PointerEvent) => {
      if (!dragged.current && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 4) {
        dragged.current = true
        onUserPan?.()
      }
      if (dragged.current) setPan({ x: moveEvent.clientX - start.x, y: moveEvent.clientY - start.y })
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  function changeZoom(next: number) {
    const clamped = Math.min(4, Math.max(1, next))
    setZoom(clamped)
    if (clamped === 1 && !follow) setPan({ x: 0, y: 0 })
  }

  // A controlled zoom back to 1 recentres the map too (unless following).
  useEffect(() => {
    if (zoom === 1 && !follow) setPan({ x: 0, y: 0 })
  }, [zoom, follow])

  // Occupancy against capacity, from the Robots currently drawn (rules/05: Zone and Edge occupancy).
  const zoneLoad = useMemo(
    () =>
      new Map(
        zones.map((zone) => [
          zone.id,
          robots.filter((robot) => pointInPolygon(robot, polygonToPoints(zone.geometry))).length,
        ]),
      ),
    [zones, robots],
  )
  const edgeLoad = useMemo(
    () =>
      new Map(
        edges.map((edge) => [
          edge.id,
          robots.filter((robot) => distanceToPolyline(robot, lineStringToPoints(edge.geometry)) < 1.2).length,
        ]),
      ),
    [edges, robots],
  )

  const focused = new Set(focusEndpointIds)
  const layerOpacity = (layer: MapEmphasis) => (emphasis.length > 0 && !emphasis.includes(layer) ? 0.28 : 1)
  const robotFaded = (code: string) => (focusRobotCodes ? !focusRobotCodes.includes(code) : false)

  const present = {
    zones: ZONE_ORDER.filter((type) => zones.some((zone) => zone.zoneType === type)),
    robots: Array.from(new Set(robots.map((robot) => robot.status))),
    edges: Array.from(new Set(edges.map((edge) => edge.direction))),
    endpointTypes: Array.from(new Set(endpoints.map((endpoint) => endpoint.endpointType))),
  }

  // A label chip is sized from its text: SVG text cannot carry its own background.
  const chipWidth = (text: string, fontSize: number) => text.length * fontSize * 0.56 + fontSize * 0.9

  return (
    <div
      className={cx(
        'relative size-full min-h-0 overflow-hidden bg-container select-none [container-type:size]',
        zoom > 1 && 'cursor-grab',
        className,
      )}
      onPointerDown={startPan}
      onClickCapture={(event) => {
        if (dragged.current) {
          event.stopPropagation()
          dragged.current = false
        }
      }}
    >
      <div
        ref={stageRef}
        className="absolute top-1/2 left-1/2 size-[min(100cqw,100cqh)] origin-center"
        style={{ transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, ['--z' as string]: zoom }}
      >
        <svg
          ref={svgRef}
          className="block size-full rounded-md tracking-normal ring-1 ring-outline-soft"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerMove={(event) => show.coordinates && setCursor(toMetres(event.clientX, event.clientY))}
          onPointerLeave={() => setCursor(null)}
          onClick={(event) => {
            const point = toMetres(event.clientX, event.clientY)
            if (point && onBackgroundClick) onBackgroundClick(point)
          }}
        >
          <defs>
            <pattern id="wmap-hatch" width="1" height="1" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="1" stroke={MAP_RED} strokeOpacity={0.22} strokeWidth="0.3" />
            </pattern>
            <pattern id="wmap-dots" width="5" height="5" patternUnits="userSpaceOnUse">
              <circle cx="0" cy="0" r="0.09" fill={MAP_LINE} />
            </pattern>
            <marker id="wmap-move" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth={0.9 * mark} markerHeight={0.9 * mark} orient="auto">
              <path d="M1 1 9 5 1 9Z" fill={MAP_INK} />
            </marker>
          </defs>

          <rect x={0} y={0} width={width} height={height} fill={MAP_PAPER} />
          {occupancyImageUrl ? (
            <image
              href={occupancyImageUrl}
              x={0}
              y={0}
              width={width}
              height={height}
              preserveAspectRatio="none"
              opacity={0.85}
              style={{ pointerEvents: 'none', filter: MAP_IMAGE_FILTER }}
            />
          ) : (
            <rect x={0} y={0} width={width} height={height} fill="url(#wmap-dots)" />
          )}

          {/* Zones: soft tinted areas with a thin edge and a coloured anchor dot (names are HTML callouts). */}
          {show.zones ? (
            <g opacity={layerOpacity('zones')}>
              {zones.map((zone) => {
                const points = polygonToPoints(zone.geometry)
                const load = zoneLoad.get(zone.id) ?? 0
                const over = show.occupancy && zone.capacity > 0 && load > zone.capacity
                const full = show.occupancy && zone.capacity > 0 && load === zone.capacity
                const isSelected = selected.zoneId === zone.id
                const anchor = zoneCentroid(points)
                // Later states win: switched off, then full, then over capacity; a selection only thickens the edge.
                const paint = over
                  ? { fill: MAP_RED, fillOpacity: 0.18, stroke: MAP_RED, strokeOpacity: 1, strokeWidth: 0.22 * mark }
                  : full
                    ? { fill: MAP_AMBER, fillOpacity: 0.2, stroke: MAP_AMBER, strokeOpacity: 1, strokeWidth: 0.1 * mark }
                    : !zone.isActive
                      ? { fill: MAP_OFF, fillOpacity: 0.08, stroke: MAP_OFF, strokeOpacity: 1, strokeWidth: 0.1 * mark }
                      : {
                          fill: 'currentColor',
                          fillOpacity: ZONE_FILL_OPACITY[zone.zoneType],
                          stroke: 'currentColor',
                          strokeOpacity: 0.7,
                          strokeWidth: 0.1 * mark,
                        }
                return (
                  <g
                    key={zone.id}
                    color={ZONE_COLOR[zone.zoneType]}
                    className="cursor-pointer"
                    onPointerEnter={() => setHoveredZoneId(zone.id)}
                    onPointerLeave={() => setHoveredZoneId((id) => (id === zone.id ? null : id))}
                    onClick={
                      onZoneClick
                        ? (event) => {
                            event.stopPropagation()
                            onZoneClick(zone.id)
                          }
                        : undefined
                    }
                  >
                    <polygon
                      points={stagePoints(points)}
                      strokeLinejoin="round"
                      strokeDasharray={zone.isActive ? undefined : `${0.5 * mark} ${0.4 * mark}`}
                      {...paint}
                      {...(isSelected ? { stroke: 'currentColor', strokeOpacity: 1, strokeWidth: 0.32 * mark } : null)}
                    />
                    {zone.zoneType === 'KEEP_OUT' ? <polygon points={stagePoints(points)} fill="url(#wmap-hatch)" stroke="none" /> : null}
                    <circle
                      cx={X(anchor.x)}
                      cy={Y(anchor.y)}
                      r={0.28 * mark}
                      fill="currentColor"
                      stroke={MAP_HALO}
                      strokeWidth={0.1 * mark}
                    />
                  </g>
                )
              })}
            </g>
          ) : null}

          {/* Edges (OTTO style): a translucent band as wide as the lane with chevrons along it, one row for a one-way
              lane, two opposite rows split by a dashed centre line for a two-way lane. */}
          {show.edges ? (
            <g opacity={layerOpacity('edges')}>
              {edges.map((edge) => {
                const points = lineStringToPoints(edge.geometry)
                const mid = points[Math.floor(points.length / 2)]
                const lane = stagePoints(points)
                const isSelected = selected.edgeId === edge.id
                const stage = points.map((p) => ({ x: X(p.x), y: Y(p.y) }))
                const width = edge.widthMeters ?? 1
                const glyphs = laneGlyphs(stage, width, edge.direction)
                const toPoints = (line: { x: number; y: number }[]) => line.map((p) => `${p.x},${p.y}`).join(' ')
                return (
                  <g
                    key={edge.id}
                    color={edge.isActive ? EDGE_COLOR[edge.direction] : MAP_OFF}
                    onPointerEnter={() => setHoveredEdgeId(edge.id)}
                    onPointerLeave={() => setHoveredEdgeId((id) => (id === edge.id ? null : id))}
                  >
                    <polyline
                      points={lane}
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity={isSelected ? LANE_BAND_OPACITY * 1.6 : LANE_BAND_OPACITY}
                      strokeWidth={width}
                      strokeLinejoin="miter"
                      strokeLinecap="butt"
                    />
                    {glyphs.sides.map((side, index) => (
                      <polyline
                        key={index}
                        points={toPoints(side)}
                        fill="none"
                        stroke="currentColor"
                        strokeOpacity={isSelected ? 1 : 0.45}
                        strokeWidth={(isSelected ? 0.12 : 0.05) * mark}
                        strokeDasharray={edge.isActive ? undefined : `${0.6 * mark} ${0.5 * mark}`}
                      />
                    ))}
                    {glyphs.divider ? (
                      <polyline
                        points={toPoints(glyphs.divider)}
                        fill="none"
                        stroke="currentColor"
                        strokeOpacity={0.6}
                        strokeWidth={0.05 * mark}
                        strokeDasharray={`${0.35 * mark} ${0.25 * mark}`}
                      />
                    ) : null}
                    {glyphs.chevrons.map((c, index) => (
                      <path
                        key={index}
                        d={CHEVRON_PATH}
                        fill="none"
                        stroke="currentColor"
                        strokeOpacity={LANE_CHEVRON_OPACITY}
                        strokeWidth={0.16}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        transform={`translate(${c.x} ${c.y}) rotate(${c.angle}) scale(${glyphs.chevronSize})`}
                      />
                    ))}
                    {/* Wide hit stroke so hover/click work on thin paths */}
                    <polyline
                      className="cursor-pointer"
                      points={lane}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={2 * mark}
                      pointerEvents="stroke"
                      onClick={
                        onEdgeClick
                          ? (event) => {
                              event.stopPropagation()
                              onEdgeClick(edge.id)
                            }
                          : undefined
                      }
                    />
                    {isSelected
                      ? points.map((point, index) => (
                          <circle key={index} cx={X(point.x)} cy={Y(point.y)} r={0.38 * mark} fill={MAP_CARD} stroke="currentColor" strokeWidth={0.16 * mark} />
                        ))
                      : null}
                    {labels !== 'none' && hoveredEdgeId === edge.id ? (
                      <circle
                        cx={X(mid.x)}
                        cy={Y(mid.y)}
                        r={0.32 * mark}
                        fill="currentColor"
                        stroke={MAP_HALO}
                        strokeWidth={0.1 * mark}
                        pointerEvents="none"
                      />
                    ) : null}
                  </g>
                )
              })}
            </g>
          ) : null}

          {drawing ? (
            <g color={EDGE_COLOR[drawing.direction]}>
              {drawing.points.length > 1 ? (
                <polyline
                  points={stagePoints(drawing.points)}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={0.22 * mark}
                  strokeDasharray={`${0.5 * mark} ${0.6 * mark}`}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {drawing.points.map((point, index) => (
                <circle key={index} cx={X(point.x)} cy={Y(point.y)} r={0.38 * mark} fill={MAP_CARD} stroke="currentColor" strokeWidth={0.16 * mark} />
              ))}
            </g>
          ) : null}

          {/* Traffic authority: granted Nav2 edge ids (matched by Edge.code when numeric). */}
          {trafficOverlay?.authorizedEdgeIds && trafficOverlay.authorizedEdgeIds.length > 0 ? (
            <g>
              {edges
                .filter((edge) => {
                  const n = Number(edge.code)
                  return Number.isFinite(n) && trafficOverlay.authorizedEdgeIds!.includes(n)
                })
                .map((edge) => {
                  const pts = lineStringToPoints(edge.geometry)
                  if (pts.length < 2) return null
                  return (
                    <polyline
                      key={`auth-${edge.id}`}
                      points={stagePoints(pts)}
                      fill="none"
                      stroke={MAP_AMBER}
                      strokeWidth={0.45 * mark}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.85}
                    />
                  )
                })}
            </g>
          ) : null}

          {/* Movements (a TransportRequestDetail: pick up here, drop off there). */}
          {movements.length > 0 ? (
            <g>
              {movements.map((movement, index) => {
                const midX = (X(movement.from.x) + X(movement.to.x)) / 2
                const midY = (Y(movement.from.y) + Y(movement.to.y)) / 2
                return (
                  <g key={index}>
                    <line
                      x1={X(movement.from.x)}
                      y1={Y(movement.from.y)}
                      x2={X(movement.to.x)}
                      y2={Y(movement.to.y)}
                      fill="none"
                      stroke={MAP_INK}
                      strokeWidth={0.2 * mark}
                      strokeDasharray={`${0.7 * mark} ${0.55 * mark}`}
                      strokeLinecap="round"
                      markerEnd="url(#wmap-move)"
                    />
                    {movement.sequence != null ? (
                      <g transform={`translate(${X(movement.from.x)} ${Y(movement.from.y) - 1.7 * mark}) scale(${mark})`}>
                        <circle r={0.72} fill={MAP_INK} />
                        <text textAnchor="middle" y={0.27} fontSize={0.66} fontWeight={600} fill={MAP_PAPER}>
                          {movement.sequence}
                        </text>
                      </g>
                    ) : null}
                    {movement.label ? (
                      <g transform={`translate(${midX} ${midY - 0.4 * mark}) scale(${mark})`}>
                        <rect
                          x={-chipWidth(movement.label, 0.75) / 2}
                          y={-0.62}
                          width={chipWidth(movement.label, 0.75)}
                          height={1.24}
                          rx={0.62}
                          fill={MAP_CARD}
                          stroke={MAP_LINE}
                          strokeWidth={0.07}
                        />
                        <text textAnchor="middle" y={0.26} fontSize={0.62} fontWeight={600} fill={MAP_INK}>
                          {movement.label}
                        </text>
                      </g>
                    ) : null}
                  </g>
                )
              })}
            </g>
          ) : null}

          {/* Endpoints: a tile in the type colour and a wedge for the arrival heading. */}
          {show.endpoints ? (
            <g opacity={layerOpacity('endpoints')}>
              {endpoints.map((endpoint) => {
                const isFocus = focused.has(endpoint.id)
                const isSelected = selected.endpointId === endpoint.id
                return (
                  <g
                    key={endpoint.id}
                    color={ENDPOINT_COLOR[endpoint.endpointType]}
                    opacity={endpoint.isEnabled ? undefined : 0.4}
                    className="cursor-pointer"
                    transform={`translate(${X(endpoint.x)} ${Y(endpoint.y)}) scale(${mark})`}
                    onPointerEnter={() => setHoveredEndpointId(endpoint.id)}
                    onPointerLeave={() => setHoveredEndpointId((id) => (id === endpoint.id ? null : id))}
                    onClick={
                      onEndpointClick
                        ? (event) => {
                            event.stopPropagation()
                            onEndpointClick(endpoint.id)
                          }
                        : undefined
                    }
                  >
                    {isFocus || isSelected || hoveredEndpointId === endpoint.id ? (
                      <circle r={1.7} fill="currentColor" fillOpacity={0.16} />
                    ) : null}
                    <path d="M1.6 0 1.0 -0.32 1.0 0.32Z" fill="currentColor" opacity={0.85} transform={`rotate(${-yawDeg(endpoint.yaw)})`} />
                    <g transform={isFocus ? 'scale(1.2)' : undefined}>
                      <rect
                        x={-0.7}
                        y={-0.7}
                        width={1.4}
                        height={1.4}
                        rx={0.36}
                        fill={isFocus ? 'currentColor' : MAP_CARD}
                        stroke={isFocus ? MAP_HALO : 'currentColor'}
                        strokeWidth={0.16}
                      />
                      <g color={isFocus ? '#fff' : undefined} pointerEvents="none">
                        <MapGlyph icon={endpoint.endpointType} size={0.92} />
                      </g>
                    </g>
                  </g>
                )
              })}
            </g>
          ) : null}

          {/* Robots: a status-coloured body with a soft halo and a code chip. */}
          {show.robots ? (
            <g>
              {robots.map((robot) => (
                <g
                  key={robot.code}
                  color={ROBOT_COLOR[robot.status]}
                  opacity={robotFaded(robot.code) ? 0.25 : undefined}
                  className={onRobotClick ? 'cursor-pointer' : undefined}
                  transform={`translate(${X(robot.x)} ${Y(robot.y)}) scale(${mark})`}
                  onClick={
                    onRobotClick
                      ? (event) => {
                          event.stopPropagation()
                          onRobotClick(robot.code)
                        }
                      : undefined
                  }
                >
                  {robot.alert ? (
                    <circle
                      r={1.9}
                      fill={MAP_RED}
                      fillOpacity={0.22}
                      className="origin-center animate-robot-pulse [transform-box:fill-box] motion-reduce:animate-none"
                    />
                  ) : (
                    <circle r={1.9} fill="currentColor" fillOpacity={0.16} />
                  )}
                  {selected.robotCode === robot.code ? (
                    <circle r={1.75} fill="none" stroke="currentColor" strokeWidth={0.18} strokeDasharray="0.5 0.4" />
                  ) : null}
                  <path
                    d="M1.15 -0.42 1.95 0 1.15 0.42Z"
                    fill="currentColor"
                    stroke={MAP_HALO}
                    strokeWidth={0.12}
                    strokeLinejoin="round"
                    transform={`rotate(${-yawDeg(robot.yaw)})`}
                  />
                  <circle r={1.1} fill="currentColor" stroke={MAP_HALO} strokeWidth={0.2} />
                  <g color="#fff" pointerEvents="none">
                    <MapGlyph icon="robot" size={1.5} />
                  </g>
                  <g transform="translate(0 2.45)">
                    <rect x={-1.55} y={-0.62} width={3.1} height={1.24} rx={0.62} fill={MAP_CARD} stroke={MAP_LINE} strokeWidth={0.07} />
                    <text textAnchor="middle" y={0.27} fontSize={0.68} fontWeight={600} fill={MAP_INK}>
                      {robot.code.replace('RBT-', '')}
                    </text>
                  </g>
                </g>
              ))}
            </g>
          ) : null}
        </svg>

        <div data-map-overlay className="pointer-events-none absolute inset-0 [&>:not([data-map-tip])]:pointer-events-auto">
          {show.zones && hoveredZoneId
            ? zones
                .filter((zone) => zone.id === hoveredZoneId)
                .map((zone) => {
                  const anchor = zoneCentroid(polygonToPoints(zone.geometry))
                  const load = zoneLoad.get(zone.id) ?? 0
                  const capacityLine =
                    zone.zoneType === 'KEEP_OUT'
                      ? 'No entry'
                      : show.occupancy
                        ? `${load}/${zone.capacity} robots`
                        : `${zone.capacity} robots`
                  return (
                    <MapNameCallout
                      key={zone.id}
                      title={zone.name}
                      accent={ZONE_COLOR[zone.zoneType]}
                      anchor={anchor}
                      bounds={bounds}
                      details={[
                        { label: 'Type', value: ZONE_LABEL[zone.zoneType] },
                        { label: 'Capacity', value: capacityLine },
                        ...(show.occupancy && zone.maxSpeed != null
                          ? [{ label: 'Max', value: `${zone.maxSpeed} m/s` }]
                          : []),
                      ]}
                    />
                  )
                })
            : null}
          {show.endpoints && labels !== 'none' && hoveredEndpointId
            ? endpoints
                .filter((endpoint) => endpoint.id === hoveredEndpointId)
                .map((endpoint) => (
                  <MapNameCallout
                    key={endpoint.id}
                    title={endpoint.name}
                    accent={ENDPOINT_COLOR[endpoint.endpointType]}
                    anchor={{ x: endpoint.x, y: endpoint.y }}
                    bounds={bounds}
                    details={[
                      { label: 'Type', value: ENDPOINT_NAME[endpoint.endpointType] },
                      { label: 'Code', value: endpoint.code },
                    ]}
                  />
                ))
            : null}
          {show.edges && labels !== 'none' && hoveredEdgeId
            ? edges
                .filter((edge) => edge.id === hoveredEdgeId)
                .map((edge) => {
                  const points = lineStringToPoints(edge.geometry)
                  const mid = points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 }
                  const load = edgeLoad.get(edge.id) ?? 0
                  return (
                    <MapNameCallout
                      key={edge.id}
                      title={edge.code}
                      accent={EDGE_COLOR[edge.direction]}
                      anchor={mid}
                      bounds={bounds}
                      details={[
                        {
                          label: 'Type',
                          value: edge.direction === 'ONE_WAY' ? 'One-way edge' : 'Two-way edge',
                        },
                        {
                          label: 'Capacity',
                          value: show.occupancy ? `${load}/${edge.capacity} robots` : `${edge.capacity} robots`,
                        },
                        ...(edge.maxSpeed != null ? [{ label: 'Max', value: `${edge.maxSpeed} m/s` }] : []),
                      ]}
                    />
                  )
                })
            : null}
          {callouts.map((callout, index) => (
            <div
              key={index}
              data-map-tip
              className={cx(
                'absolute flex origin-bottom -translate-x-1/2 translate-y-[calc(-100%-24px)] scale-[calc(1/var(--z,1))] flex-col rounded-sm px-3 py-2 text-xs whitespace-nowrap text-white shadow-float',
                "after:absolute after:-bottom-1 after:left-1/2 after:size-2 after:-translate-x-1/2 after:rotate-45 after:bg-inherit after:content-['']",
                CALLOUT_TONE[callout.tone ?? 'dark'],
              )}
              style={toPercent({ x: callout.x, y: callout.y }, bounds)}
            >
              {callout.lines.map((line, lineIndex) => (
                <span key={lineIndex} className={lineIndex === 0 ? 'font-medium' : 'opacity-80'}>
                  {line}
                </span>
              ))}
            </div>
          ))}
          {children}
        </div>
      </div>

      {show.legend ? (
        <details
          data-map-ui
          className={cx(CHROME, 'top-3 left-3 min-w-40 rounded-md px-3.5 py-2.5 text-xs text-ink-2')}
          open={show.legendOpen ? true : undefined}
        >
          <summary className="font-medium text-ink">Guide</summary>
          {present.robots.length > 0 ? (
            <GuideSection title="Robots">
              {present.robots.map((status) => (
                <GuideItem key={status} label={humanize(status)}>
                  <svg className="shrink-0" width="18" height="18" viewBox="-1.2 -1.2 2.4 2.4" color={ROBOT_COLOR[status]}>
                    <circle r={1.05} fill="currentColor" />
                    <g color="#fff">
                      <MapGlyph icon="robot" size={1.3} />
                    </g>
                  </svg>
                </GuideItem>
              ))}
            </GuideSection>
          ) : null}
          {show.zones && present.zones.length > 0 ? (
            <GuideSection title="Zones">
              {present.zones.map((type) => (
                <GuideItem key={type} label={ZONE_LABEL[type]}>
                  <i className="size-2.5 shrink-0 rounded-xs border-[1.5px]" style={zoneSwatchStyle(type)} />
                </GuideItem>
              ))}
            </GuideSection>
          ) : null}
          {show.edges && present.edges.length > 0 ? (
            <GuideSection title="Paths">
              {present.edges.map((direction) => (
                <GuideItem key={direction} label={direction === 'ONE_WAY' ? 'One-way edge' : 'Two-way edge'}>
                  <svg className="shrink-0" width="22" height="12" viewBox="0 0 22 12" color={EDGE_COLOR[direction]}>
                    <rect x={0} y={0} width={22} height={12} fill="currentColor" fillOpacity={LANE_BAND_OPACITY * 1.5} />
                    {direction === 'ONE_WAY' ? (
                      <path d="M8 2 L13 6 L8 10" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                    ) : (
                      <>
                        <line x1={0} y1={6} x2={22} y2={6} stroke="currentColor" strokeWidth={0.8} strokeDasharray="2 1.5" />
                        <path d="M13 1.2 L10 3.2 L13 5" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M9 7 L12 8.8 L9 10.8" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
                      </>
                    )}
                  </svg>
                </GuideItem>
              ))}
            </GuideSection>
          ) : null}
          {show.endpoints && present.endpointTypes.length > 0 ? (
            <GuideSection title="Endpoints" note="The wedge shows the arrival heading." columns>
              {present.endpointTypes.map((type) => (
                <GuideItem key={type} label={ENDPOINT_NAME[type]}>
                  <svg className="shrink-0" width="18" height="18" viewBox="-1 -1 2 2" color={ENDPOINT_COLOR[type]}>
                    <rect x={-0.85} y={-0.85} width={1.7} height={1.7} rx={0.42} fill={MAP_CARD} stroke="currentColor" strokeWidth={0.16} />
                    <MapGlyph icon={type} size={1.05} />
                  </svg>
                </GuideItem>
              ))}
            </GuideSection>
          ) : null}
        </details>
      ) : null}

      {show.controls ? (
        <div data-map-ui className={cx(CHROME, 'bottom-3 flex flex-col rounded-full p-1')} style={{ right: 12 + uiInset }}>
          <button type="button" className={ZOOM_BUTTON} aria-label="Zoom in" disabled={zoom >= 4} onClick={() => changeZoom(zoom + 0.5)}>
            <Icon name="plus" size={15} />
          </button>
          <button type="button" className={ZOOM_BUTTON} aria-label="Zoom out" disabled={zoom <= 1} onClick={() => changeZoom(zoom - 0.5)}>
            <Icon name="minus" size={15} />
          </button>
          <button type="button" className={ZOOM_BUTTON} aria-label="Reset view" disabled={zoom === 1} onClick={() => changeZoom(1)}>
            <Icon name="crosshair" size={15} />
          </button>
        </div>
      ) : null}

      {show.coordinates ? (
        <div data-map-ui className={cx(CHROME, 'pointer-events-none bottom-3 left-3 rounded-full px-3 py-1 font-mono text-xs text-ink-2')}>
          {cursor && cursor.x >= bounds.minX && cursor.x <= bounds.maxX && cursor.y >= bounds.minY && cursor.y <= bounds.maxY
            ? `x ${cursor.x.toFixed(1)} m, y ${cursor.y.toFixed(1)} m`
            : `${width} × ${height} m`}
        </div>
      ) : null}
    </div>
  )
}

function GuideSection({ title, note, columns = false, children }: { title: string; note?: string; columns?: boolean; children: ReactNode }) {
  return (
    <section className="mt-2.5">
      <h5 className="mb-1 text-muted">{title}</h5>
      <ul className={columns ? 'grid grid-cols-2 gap-x-3.5' : undefined}>{children}</ul>
      {note ? <p className="mt-1 text-muted">{note}</p> : null}
    </section>
  )
}

function GuideItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 py-0.5">
      {children}
      {label}
    </li>
  )
}

function zoneCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  const x = points.reduce((sum, point) => sum + point.x, 0) / points.length
  const y = points.reduce((sum, point) => sum + point.y, 0) / points.length
  return { x, y }
}

/** Place the bubble toward the map centre so edge zones keep a full name on screen. */
function zoneCalloutSide(anchor: Point, bounds: MapBounds): { horizontal: 'left' | 'right'; vertical: 'above' | 'below' } {
  const rx = (anchor.x - bounds.minX) / Math.max(bounds.maxX - bounds.minX, 1e-6)
  const ry = (anchor.y - bounds.minY) / Math.max(bounds.maxY - bounds.minY, 1e-6)
  return {
    horizontal: rx < 0.55 ? 'right' : 'left',
    vertical: ry < 0.45 ? 'above' : 'below',
  }
}

function MapNameCallout({
  title,
  accent,
  anchor,
  bounds,
  details,
}: {
  title: string
  accent: string
  anchor: Point
  bounds: MapBounds
  details: { label: string; value: string }[]
}) {
  const { horizontal, vertical } = zoneCalloutSide(anchor, bounds)

  return (
    <div
      data-map-tip
      className="absolute z-5 scale-[calc(1/var(--z,1))]"
      style={toPercent(anchor, bounds)}
    >
      <span
        aria-hidden
        className={cx(
          'absolute left-0 top-0 w-px bg-ink/35',
          vertical === 'above' ? 'h-3.5 -translate-y-full' : 'h-3.5',
          horizontal === 'right' ? 'translate-x-0' : '-translate-x-px',
        )}
      />
      <div
        className={cx(
          'absolute w-max max-w-none rounded-sm border border-outline-soft bg-surface/95 px-2.5 py-1.5 text-xs whitespace-nowrap text-ink shadow-float ring-1 ring-amber/40',
          vertical === 'above' ? 'bottom-3.5' : 'top-3.5',
          horizontal === 'right' ? 'left-0' : 'right-0',
        )}
      >
        <div className="flex items-center gap-2">
          <i className="size-1.5 shrink-0 rounded-full" style={{ background: accent }} aria-hidden />
          <span className="font-medium">{title}</span>
          {details.map((row) => (
            <span key={row.label} className="flex items-center gap-1 text-ink-2">
              <span className="text-muted/70" aria-hidden>
                ·
              </span>
              <span className="text-muted">{row.label}</span>
              <span>{row.value}</span>
            </span>
          ))}
        </div>
        <span
          aria-hidden
          className={cx(
            'absolute size-1.5 rotate-45 border-outline-soft bg-surface',
            vertical === 'above' ? 'bottom-[-3px] border-r border-b' : 'top-[-3px] border-l border-t',
            horizontal === 'right' ? 'left-2' : 'right-2',
          )}
        />
      </div>
    </div>
  )
}

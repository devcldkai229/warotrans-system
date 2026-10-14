import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
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
  MAP_AMBER,
  MAP_INK,
  MAP_INK_2,
  MAP_LANE,
  MAP_LINE,
  MAP_MUTED,
  MAP_OFF,
  MAP_RED,
  ROBOT_COLOR,
  ZONE_COLOR,
  ZONE_LABEL,
  ZONE_ORDER,
  toPercent,
  zoneSwatchStyle,
} from './mapStyle'
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
  callouts?: MapCallout[]
  selected?: { zoneId?: string; edgeId?: string; endpointId?: string; robotCode?: string }
  onRobotClick?: (code: string) => void
  onZoneClick?: (id: string) => void
  onEdgeClick?: (id: string) => void
  onEndpointClick?: (id: string) => void
  /** Click on empty map, in metres. */
  onBackgroundClick?: (point: Point) => void
  /** Edge being drawn in the editor. */
  drawing?: { points: Point[]; direction: EdgeDirection }
  /** Occupancy preview PNG (MapVersion.previewImageUri), stretched to map bounds. */
  occupancyImageUrl?: string | null
  className?: string
  /** HTML drawn on top of the map: positioned with `toPercent`, inside the same square as the map. */
  children?: ReactNode
}

// SVG text cannot carry its own background: a white outline keeps it readable over zones and lanes.
const TEXT_HALO = {
  paintOrder: 'stroke',
  stroke: '#fff',
  strokeWidth: 0.22,
  strokeLinejoin: 'round',
  pointerEvents: 'none',
} as const

const CALLOUT_TONE = { dark: 'bg-ink', warn: 'bg-amber-ink', danger: 'bg-red-ink' }

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
  callouts = [],
  selected = {},
  onRobotClick,
  onZoneClick,
  onEdgeClick,
  onEndpointClick,
  onBackgroundClick,
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

  const svgRef = useRef<SVGSVGElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [cursor, setCursor] = useState<Point | null>(null)
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

  function changeZoom(next: number) {
    const clamped = Math.min(4, Math.max(1, next))
    setZoom(clamped)
    if (clamped === 1) setPan({ x: 0, y: 0 })
  }

  // Occupancy against capacity, from the Robots currently drawn (rules/05: Zone and Edge occupancy).
  const zoneLoad = useMemo(
    () =>
      new Map(zones.map((zone) => [zone.id, robots.filter((robot) => pointInPolygon(robot, zone.geometry.points)).length])),
    [zones, robots],
  )
  const edgeLoad = useMemo(
    () =>
      new Map(edges.map((edge) => [edge.id, robots.filter((robot) => distanceToPolyline(robot, edge.geometry.points) < 1.2).length])),
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
            <marker id="wmap-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerUnits="userSpaceOnUse" markerWidth="0.75" markerHeight="0.75" orient="auto-start-reverse">
              <path d="M1 1.2 8.6 5 1 8.8Z" fill="context-stroke" />
            </marker>
            <marker id="wmap-move" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="0.9" markerHeight="0.9" orient="auto">
              <path d="M1 1 9 5 1 9Z" fill={MAP_INK} />
            </marker>
          </defs>

          <rect x={0} y={0} width={width} height={height} fill="#fff" />
          {occupancyImageUrl ? (
            <image
              href={occupancyImageUrl}
              x={0}
              y={0}
              width={width}
              height={height}
              preserveAspectRatio="none"
              opacity={0.85}
              style={{ pointerEvents: 'none' }}
            />
          ) : (
            <rect x={0} y={0} width={width} height={height} fill="url(#wmap-dots)" />
          )}

          {/* Zones: soft tinted areas with a thin edge, a coloured dot and the name. */}
          {show.zones ? (
            <g opacity={layerOpacity('zones')}>
              {zones.map((zone) => {
                const points = zone.geometry.points
                const xs = points.map((point) => X(point.x))
                const ys = points.map((point) => Y(point.y))
                const load = zoneLoad.get(zone.id) ?? 0
                const over = show.occupancy && zone.capacity > 0 && load > zone.capacity
                const full = show.occupancy && zone.capacity > 0 && load === zone.capacity
                const isSelected = selected.zoneId === zone.id
                const left = Math.min(...xs)
                const top = Math.min(...ys)
                // Later states win: switched off, then full, then over capacity; a selection only thickens the edge.
                const paint = over
                  ? { fill: MAP_RED, fillOpacity: 0.18, stroke: MAP_RED, strokeOpacity: 1, strokeWidth: 0.22 }
                  : full
                    ? { fill: MAP_AMBER, fillOpacity: 0.2, stroke: MAP_AMBER, strokeOpacity: 1, strokeWidth: 0.1 }
                    : !zone.isActive
                      ? { fill: MAP_OFF, fillOpacity: 0.08, stroke: MAP_OFF, strokeOpacity: 1, strokeWidth: 0.1 }
                      : {
                          fill: 'currentColor',
                          fillOpacity: zone.zoneType === 'INTERSECTION' ? 0.11 : 0.07,
                          stroke: 'currentColor',
                          strokeOpacity: 0.55,
                          strokeWidth: 0.1,
                        }
                return (
                  <g
                    key={zone.id}
                    color={ZONE_COLOR[zone.zoneType]}
                    className={onZoneClick ? 'cursor-pointer' : undefined}
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
                      strokeDasharray={zone.isActive ? undefined : '0.5 0.4'}
                      {...paint}
                      {...(isSelected ? { stroke: 'currentColor', strokeOpacity: 1, strokeWidth: 0.32 } : null)}
                    />
                    {zone.zoneType === 'RESTRICTED_AREA' ? <polygon points={stagePoints(points)} fill="url(#wmap-hatch)" stroke="none" /> : null}
                    <circle cx={left + 0.85} cy={top + 0.95} r={0.22} fill="currentColor" />
                    <text x={left + 1.3} y={top + 1.28} fontSize={0.82} fontWeight={600} fill={MAP_INK} {...TEXT_HALO}>
                      {zone.name}
                    </text>
                    <text x={left + 0.65} y={top + 2.2} fontSize={0.6} fill={MAP_MUTED} {...TEXT_HALO}>
                      {zone.zoneType === 'RESTRICTED_AREA'
                        ? 'No entry'
                        : show.occupancy
                          ? `${load}/${zone.capacity} Robots${zone.maxSpeed != null ? ` · max ${zone.maxSpeed} m/s` : ''}`
                          : `${ZONE_LABEL[zone.zoneType]} · capacity ${zone.capacity}`}
                    </text>
                  </g>
                )
              })}
            </g>
          ) : null}

          {/* Edges: a pale lane with a thin coloured centre line. */}
          {show.edges ? (
            <g opacity={layerOpacity('edges')}>
              {edges.map((edge) => {
                const points = edge.geometry.points
                const mid = points[Math.floor(points.length / 2)]
                const load = edgeLoad.get(edge.id) ?? 0
                const lane = stagePoints(points)
                const isSelected = selected.edgeId === edge.id
                return (
                  <g key={edge.id} color={EDGE_COLOR[edge.direction]}>
                    <polyline
                      points={lane}
                      fill="none"
                      stroke={isSelected ? 'currentColor' : MAP_LANE}
                      strokeOpacity={isSelected ? 0.22 : 1}
                      strokeWidth={1.2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    <polyline
                      points={lane}
                      fill="none"
                      stroke={edge.isActive ? 'currentColor' : MAP_OFF}
                      strokeWidth={isSelected ? 0.3 : 0.15}
                      strokeDasharray={edge.isActive ? undefined : '0.6 0.5'}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      opacity={isSelected ? 1 : 0.8}
                      markerEnd="url(#wmap-arrow)"
                      markerStart={edge.direction === 'BIDIRECTIONAL' ? 'url(#wmap-arrow)' : undefined}
                    />
                    {edge.direction === 'ONE_WAY'
                      ? points.slice(0, -1).map((a, index) => {
                          const b = points[index + 1]
                          const length = Math.hypot(b.x - a.x, b.y - a.y)
                          if (length < 4) return null
                          const angle = (Math.atan2(Y(b.y) - Y(a.y), X(b.x) - X(a.x)) * 180) / Math.PI
                          return (
                            <path
                              key={index}
                              d="M-0.3 -0.3 0.2 0 -0.3 0.3"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={0.14}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              transform={`translate(${(X(a.x) + X(b.x)) / 2} ${(Y(a.y) + Y(b.y)) / 2}) rotate(${angle})`}
                            />
                          )
                        })
                      : null}
                    {onEdgeClick ? (
                      <polyline
                        className="cursor-pointer"
                        points={lane}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={2}
                        pointerEvents="stroke"
                        onClick={(event) => {
                          event.stopPropagation()
                          onEdgeClick(edge.id)
                        }}
                      />
                    ) : null}
                    {isSelected
                      ? points.map((point, index) => (
                          <circle key={index} cx={X(point.x)} cy={Y(point.y)} r={0.38} fill="#fff" stroke="currentColor" strokeWidth={0.16} />
                        ))
                      : null}
                    {show.occupancy && load > 0 ? (
                      <g transform={`translate(${X(mid.x)} ${Y(mid.y)})`}>
                        <rect x={-1.25} y={-0.72} width={2.5} height={1.44} rx={0.72} fill="#fff" stroke={MAP_LINE} strokeWidth={0.08} />
                        <text textAnchor="middle" y={0.26} fontSize={0.68} fontWeight={600} fill={MAP_INK_2}>
                          {load}/{edge.capacity}
                        </text>
                      </g>
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
                  strokeWidth={0.22}
                  strokeDasharray="0.5 0.6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {drawing.points.map((point, index) => (
                <circle key={index} cx={X(point.x)} cy={Y(point.y)} r={0.38} fill="#fff" stroke="currentColor" strokeWidth={0.16} />
              ))}
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
                      strokeWidth={0.2}
                      strokeDasharray="0.7 0.55"
                      strokeLinecap="round"
                      markerEnd="url(#wmap-move)"
                    />
                    {movement.sequence != null ? (
                      <g transform={`translate(${X(movement.from.x)} ${Y(movement.from.y) - 1.7})`}>
                        <circle r={0.72} fill={MAP_INK} />
                        <text textAnchor="middle" y={0.27} fontSize={0.66} fontWeight={600} fill="#fff">
                          {movement.sequence}
                        </text>
                      </g>
                    ) : null}
                    {movement.label ? (
                      <g transform={`translate(${midX} ${midY - 0.4})`}>
                        <rect
                          x={-chipWidth(movement.label, 0.75) / 2}
                          y={-0.62}
                          width={chipWidth(movement.label, 0.75)}
                          height={1.24}
                          rx={0.62}
                          fill="#fff"
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
              {endpoints.map((endpoint, index) => {
                const isFocus = focused.has(endpoint.id)
                const isSelected = selected.endpointId === endpoint.id
                const labelled = labels === 'all' || (labels === 'focus' && isFocus)
                const small = labels === 'all' && !isFocus
                const text = small ? endpoint.name.replace(/^Rack /, '') : endpoint.name
                const fontSize = small ? 0.6 : 0.75
                const labelY = 1.9 + (labels === 'all' && index % 2 === 1 ? 0.95 : 0)
                return (
                  <g
                    key={endpoint.id}
                    color={ENDPOINT_COLOR[endpoint.endpointType]}
                    opacity={endpoint.isEnabled ? undefined : 0.4}
                    className={onEndpointClick ? 'cursor-pointer' : undefined}
                    transform={`translate(${X(endpoint.x)} ${Y(endpoint.y)})`}
                    onClick={
                      onEndpointClick
                        ? (event) => {
                            event.stopPropagation()
                            onEndpointClick(endpoint.id)
                          }
                        : undefined
                    }
                  >
                    {isFocus || isSelected ? <circle r={1.7} fill="currentColor" fillOpacity={0.16} /> : null}
                    <path d="M1.6 0 1.0 -0.32 1.0 0.32Z" fill="currentColor" opacity={0.85} transform={`rotate(${-endpoint.yaw})`} />
                    <g transform={isFocus ? 'scale(1.2)' : undefined}>
                      <rect
                        x={-0.7}
                        y={-0.7}
                        width={1.4}
                        height={1.4}
                        rx={0.36}
                        fill={isFocus ? 'currentColor' : '#fff'}
                        stroke={isFocus ? '#fff' : 'currentColor'}
                        strokeWidth={0.16}
                      />
                      <g color={isFocus ? '#fff' : undefined} pointerEvents="none">
                        <MapGlyph icon={endpoint.endpointType} size={0.92} />
                      </g>
                    </g>
                    {labelled ? (
                      <g transform={`translate(0 ${labelY})`} pointerEvents="none">
                        <rect
                          x={-chipWidth(text, fontSize) / 2}
                          y={-fontSize * 0.85}
                          width={chipWidth(text, fontSize)}
                          height={fontSize * 1.6}
                          rx={fontSize * 0.5}
                          fill="#fff"
                          fillOpacity={0.92}
                          stroke={MAP_LINE}
                          strokeWidth={0.06}
                        />
                        <text fontSize={fontSize} fontWeight={500} fill={MAP_INK} textAnchor="middle" y={fontSize * 0.33}>
                          {text}
                        </text>
                      </g>
                    ) : null}
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
                  transform={`translate(${X(robot.x)} ${Y(robot.y)})`}
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
                    stroke="#fff"
                    strokeWidth={0.12}
                    strokeLinejoin="round"
                    transform={`rotate(${-robot.yaw})`}
                  />
                  <circle r={1.1} fill="currentColor" stroke="#fff" strokeWidth={0.2} />
                  <g color="#fff" pointerEvents="none">
                    <MapGlyph icon="robot" size={1.5} />
                  </g>
                  <g transform="translate(0 2.45)">
                    <rect x={-1.55} y={-0.62} width={3.1} height={1.24} rx={0.62} fill="#fff" stroke={MAP_LINE} strokeWidth={0.07} />
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
                  <i className="h-1 w-4 shrink-0 rounded-full" style={{ background: EDGE_COLOR[direction] }} />
                </GuideItem>
              ))}
            </GuideSection>
          ) : null}
          {show.endpoints && present.endpointTypes.length > 0 ? (
            <GuideSection title="Endpoints" note="The wedge shows the arrival heading." columns>
              {present.endpointTypes.map((type) => (
                <GuideItem key={type} label={ENDPOINT_NAME[type]}>
                  <svg className="shrink-0" width="18" height="18" viewBox="-1 -1 2 2" color={ENDPOINT_COLOR[type]}>
                    <rect x={-0.85} y={-0.85} width={1.7} height={1.7} rx={0.42} fill="#fff" stroke="currentColor" strokeWidth={0.16} />
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

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { Edge, EdgeDirection, Endpoint, Point, RobotStatus, Zone } from '@/shared/api/contracts'
import { DEFAULT_MAP_BOUNDS, type MapBounds } from '@/shared/lib/mapView'
import { Icon } from '@/shared/ui/Icon'
import { toPercent } from './mapStyle'
import { MapGlyph } from './MapGlyph'
import { EDGE_COLOR, ENDPOINT_COLOR, ENDPOINT_NAME, ROBOT_COLOR, ZONE_LABEL, ZONE_ORDER } from './mapStyle'
import { SCENE_EDGES, SCENE_ENDPOINTS, SCENE_ZONES, distanceToPolyline, pointInPolygon } from './scene'
import './warehouseMap.css'

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
  legend?: boolean
  /** Start with the legend expanded (wide maps); small panes keep it folded. */
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
  /** Pixels on the right that panels cover: the zoom controls and legend stay clear of them without moving the map. */
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
  className?: string
  /** HTML drawn on top of the map: positioned with `toPercent`, inside the same square as the map. */
  children?: ReactNode
}

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
    if (zoom <= 1 || (event.target as HTMLElement).closest('.wmap__ui, .wmap__overlay > :not(.wmap__tip)')) return
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
      className={`wmap${className ? ` ${className}` : ''}${zoom > 1 ? ' is-zoomed' : ''}`}
      onPointerDown={startPan}
      onClickCapture={(event) => {
        if (dragged.current) {
          event.stopPropagation()
          dragged.current = false
        }
      }}
    >
      <div
        className="wmap__stage"
        style={{ transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, ['--z' as string]: zoom }}
      >
        <svg
          ref={svgRef}
          className="wmap__svg"
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
              <line x1="0" y1="0" x2="0" y2="1" stroke="rgba(220,38,38,0.22)" strokeWidth="0.3" />
            </pattern>
            <pattern id="wmap-dots" width="5" height="5" patternUnits="userSpaceOnUse">
              <circle cx="0" cy="0" r="0.09" fill="#cbd5e1" />
            </pattern>
            <marker id="wmap-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerUnits="userSpaceOnUse" markerWidth="0.75" markerHeight="0.75" orient="auto-start-reverse">
              <path d="M1 1.2 8.6 5 1 8.8Z" fill="context-stroke" />
            </marker>
            <marker id="wmap-move" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="0.9" markerHeight="0.9" orient="auto">
              <path d="M1 1 9 5 1 9Z" fill="#1e3a8a" />
            </marker>
          </defs>

          <rect className="wmap__bg" x={0} y={0} width={width} height={height} />
          <rect x={0} y={0} width={width} height={height} fill="url(#wmap-dots)" />

          {show.zones ? (
            <g style={{ opacity: layerOpacity('zones') }}>
              {zones.map((zone) => {
                const points = zone.geometry.points
                const xs = points.map((point) => X(point.x))
                const ys = points.map((point) => Y(point.y))
                const load = zoneLoad.get(zone.id) ?? 0
                const over = show.occupancy && zone.capacity > 0 && load > zone.capacity
                const full = show.occupancy && zone.capacity > 0 && load === zone.capacity
                const left = Math.min(...xs)
                const top = Math.min(...ys)
                return (
                  <g
                    key={zone.id}
                    className={`wz wz--${zone.zoneType}${zone.isActive ? '' : ' is-off'}${selected.zoneId === zone.id ? ' is-selected' : ''}${over ? ' is-over' : full ? ' is-full' : ''}${onZoneClick ? ' is-clickable' : ''}`}
                    onClick={
                      onZoneClick
                        ? (event) => {
                            event.stopPropagation()
                            onZoneClick(zone.id)
                          }
                        : undefined
                    }
                  >
                    <polygon points={stagePoints(points)} />
                    {zone.zoneType === 'RESTRICTED_AREA' ? <polygon className="wz__hatch" points={stagePoints(points)} /> : null}
                    <circle className="wz__accent" cx={left + 0.85} cy={top + 0.95} r={0.22} />
                    <text className="wz__name" x={left + 1.3} y={top + 1.28}>
                      {zone.name}
                    </text>
                    <text className="wz__meta" x={left + 0.65} y={top + 2.2}>
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

          {show.edges ? (
            <g style={{ opacity: layerOpacity('edges') }}>
              {edges.map((edge) => {
                const points = edge.geometry.points
                const mid = points[Math.floor(points.length / 2)]
                const load = edgeLoad.get(edge.id) ?? 0
                const lane = stagePoints(points)
                return (
                  <g
                    key={edge.id}
                    className={`we we--${edge.direction}${edge.isActive ? '' : ' is-off'}${selected.edgeId === edge.id ? ' is-selected' : ''}`}
                    style={{ color: EDGE_COLOR[edge.direction] }}
                  >
                    <polyline className="we__lane" points={lane} />
                    <polyline
                      className="we__line"
                      points={lane}
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
                              className="we__chevron"
                              d="M-0.3 -0.3 0.2 0 -0.3 0.3"
                              transform={`translate(${(X(a.x) + X(b.x)) / 2} ${(Y(a.y) + Y(b.y)) / 2}) rotate(${angle})`}
                            />
                          )
                        })
                      : null}
                    {onEdgeClick ? (
                      <polyline
                        className="we__hit"
                        points={lane}
                        onClick={(event) => {
                          event.stopPropagation()
                          onEdgeClick(edge.id)
                        }}
                      />
                    ) : null}
                    {selected.edgeId === edge.id
                      ? points.map((point, index) => <circle key={index} className="we__vertex" cx={X(point.x)} cy={Y(point.y)} r={0.38} />)
                      : null}
                    {show.occupancy && load > 0 ? (
                      <g className="we__load" transform={`translate(${X(mid.x)} ${Y(mid.y)})`}>
                        <rect x={-1.25} y={-0.72} width={2.5} height={1.44} rx={0.72} />
                        <text textAnchor="middle" y={0.26}>
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
            <g className="we is-drawing" style={{ color: EDGE_COLOR[drawing.direction] }}>
              {drawing.points.length > 1 ? <polyline className="we__line" points={stagePoints(drawing.points)} /> : null}
              {drawing.points.map((point, index) => (
                <circle key={index} className="we__vertex" cx={X(point.x)} cy={Y(point.y)} r={0.38} />
              ))}
            </g>
          ) : null}

          {movements.length > 0 ? (
            <g className="wm">
              {movements.map((movement, index) => {
                const midX = (X(movement.from.x) + X(movement.to.x)) / 2
                const midY = (Y(movement.from.y) + Y(movement.to.y)) / 2
                return (
                  <g key={index}>
                    <line
                      className="wm__line"
                      x1={X(movement.from.x)}
                      y1={Y(movement.from.y)}
                      x2={X(movement.to.x)}
                      y2={Y(movement.to.y)}
                      markerEnd="url(#wmap-move)"
                    />
                    {movement.sequence != null ? (
                      <g transform={`translate(${X(movement.from.x)} ${Y(movement.from.y) - 1.7})`}>
                        <circle r={0.72} />
                        <text textAnchor="middle" y={0.27}>
                          {movement.sequence}
                        </text>
                      </g>
                    ) : null}
                    {movement.label ? (
                      <g transform={`translate(${midX} ${midY - 0.4})`}>
                        <rect className="wm__chip" x={-chipWidth(movement.label, 0.75) / 2} y={-0.62} width={chipWidth(movement.label, 0.75)} height={1.24} rx={0.62} />
                        <text className="wm__label" textAnchor="middle" y={0.26}>
                          {movement.label}
                        </text>
                      </g>
                    ) : null}
                  </g>
                )
              })}
            </g>
          ) : null}

          {show.endpoints ? (
            <g style={{ opacity: layerOpacity('endpoints') }}>
              {endpoints.map((endpoint, index) => {
                const isFocus = focused.has(endpoint.id)
                const color = ENDPOINT_COLOR[endpoint.endpointType]
                const labelled = labels === 'all' || (labels === 'focus' && isFocus)
                const small = labels === 'all' && !isFocus
                const text = small ? endpoint.name.replace(/^Rack /, '') : endpoint.name
                const fontSize = small ? 0.6 : 0.75
                const labelY = 1.9 + (labels === 'all' && index % 2 === 1 ? 0.95 : 0)
                return (
                  <g
                    key={endpoint.id}
                    className={`wep${isFocus ? ' is-focus' : ''}${selected.endpointId === endpoint.id ? ' is-selected' : ''}${endpoint.isEnabled ? '' : ' is-off'}${onEndpointClick ? ' is-clickable' : ''}`}
                    style={{ color }}
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
                    {isFocus || selected.endpointId === endpoint.id ? <circle className="wep__halo" r={1.7} /> : null}
                    <path className="wep__wedge" d="M1.6 0 1.0 -0.32 1.0 0.32Z" transform={`rotate(${-endpoint.yaw})`} />
                    <g transform={isFocus ? 'scale(1.2)' : undefined}>
                      <rect className="wep__dot" x={-0.7} y={-0.7} width={1.4} height={1.4} rx={0.36} />
                      <g className="wep__glyph">
                        <MapGlyph icon={endpoint.endpointType} size={0.92} />
                      </g>
                    </g>
                    {labelled ? (
                      <g transform={`translate(0 ${labelY})`}>
                        <rect className="wep__chip" x={-chipWidth(text, fontSize) / 2} y={-fontSize * 0.85} width={chipWidth(text, fontSize)} height={fontSize * 1.6} rx={fontSize * 0.5} />
                        <text className="wep__label" style={{ fontSize }} textAnchor="middle" y={fontSize * 0.33}>
                          {text}
                        </text>
                      </g>
                    ) : null}
                  </g>
                )
              })}
            </g>
          ) : null}

          {show.robots ? (
            <g>
              {robots.map((robot) => (
                <g
                  key={robot.code}
                  className={`wr${robotFaded(robot.code) ? ' is-faded' : ''}${selected.robotCode === robot.code ? ' is-selected' : ''}${robot.alert ? ' is-alert' : ''}${onRobotClick ? ' is-clickable' : ''}`}
                  style={{ color: ROBOT_COLOR[robot.status] }}
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
                  <circle className="wr__halo" r={1.9} />
                  {selected.robotCode === robot.code ? <circle className="wr__ring" r={1.75} /> : null}
                  <path className="wr__pointer" d="M1.15 -0.42 1.95 0 1.15 0.42Z" transform={`rotate(${-robot.yaw})`} />
                  <circle className="wr__body" r={1.1} />
                  <g className="wr__glyph">
                    <MapGlyph icon="robot" size={1.5} />
                  </g>
                  <g transform="translate(0 2.45)">
                    <rect className="wr__chip" x={-1.55} y={-0.62} width={3.1} height={1.24} rx={0.62} />
                    <text textAnchor="middle" y={0.27}>
                      {robot.code.replace('RBT-', '')}
                    </text>
                  </g>
                </g>
              ))}
            </g>
          ) : null}
        </svg>

        <div className="wmap__overlay">
          {callouts.map((callout, index) => (
            <div
              key={index}
              className={`wmap__tip wmap__tip--${callout.tone ?? 'dark'}`}
              style={toPercent({ x: callout.x, y: callout.y }, bounds)}
            >
              {callout.lines.map((line, lineIndex) => (
                <span key={lineIndex}>{line}</span>
              ))}
            </div>
          ))}
          {children}
        </div>
      </div>

      {show.legend ? (
        <details className="wmap__ui wmap__legend" open={show.legendOpen ? true : undefined}>
          <summary>Legend</summary>
          {present.robots.length > 0 ? (
            <section>
              <h5>Robots</h5>
              <ul>
                {present.robots.map((status) => (
                  <li key={status}>
                    <svg className="wl-icon" width="18" height="18" viewBox="-1.2 -1.2 2.4 2.4" style={{ color: ROBOT_COLOR[status] }}>
                      <circle r={1.05} fill="currentColor" />
                      <g style={{ color: '#fff' }}>
                        <MapGlyph icon="robot" size={1.3} />
                      </g>
                    </svg>{' '}
                    {status.charAt(0) + status.slice(1).toLowerCase()}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {show.zones && present.zones.length > 0 ? (
            <section>
              <h5>Zones</h5>
              <ul>
                {present.zones.map((type) => (
                  <li key={type}>
                    <i className={`wl-zone wl-zone--${type}`} /> {ZONE_LABEL[type]}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {show.edges && present.edges.length > 0 ? (
            <section>
              <h5>Paths</h5>
              <ul>
                {show.edges
                  ? present.edges.map((direction) => (
                      <li key={direction}>
                        <i className="wl-edge" style={{ background: EDGE_COLOR[direction] }} />{' '}
                        {direction === 'ONE_WAY' ? 'One-way edge' : 'Two-way edge'}
                      </li>
                    ))
                  : null}
              </ul>
            </section>
          ) : null}
          {show.endpoints && present.endpointTypes.length > 0 ? (
            <section>
              <h5>Endpoints · wedge = arrival heading</h5>
              <ul className="wmap__legend-grid">
                {present.endpointTypes.map((type) => (
                  <li key={type}>
                    <svg className="wl-icon" width="18" height="18" viewBox="-1 -1 2 2" style={{ color: ENDPOINT_COLOR[type] }}>
                      <rect x={-0.85} y={-0.85} width={1.7} height={1.7} rx={0.42} fill="#fff" stroke="currentColor" strokeWidth={0.16} />
                      <MapGlyph icon={type} size={1.05} />
                    </svg>{' '}
                    {ENDPOINT_NAME[type]}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </details>
      ) : null}

      {show.controls ? (
        <div className="wmap__ui wmap__controls" style={{ right: 12 + uiInset }}>
          <button type="button" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => changeZoom(zoom + 0.5)}>
            <Icon name="plus" size={14} />
          </button>
          <button type="button" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => changeZoom(zoom - 0.5)}>
            <Icon name="minus" size={14} />
          </button>
          <button type="button" aria-label="Reset view" disabled={zoom === 1} onClick={() => changeZoom(1)}>
            <Icon name="crosshair" size={14} />
          </button>
        </div>
      ) : null}

      {show.coordinates ? (
        <div className="wmap__ui wmap__coords">
          {cursor && cursor.x >= bounds.minX && cursor.x <= bounds.maxX && cursor.y >= bounds.minY && cursor.y <= bounds.maxY
            ? `x ${cursor.x.toFixed(1)} m · y ${cursor.y.toFixed(1)} m`
            : `${width} × ${height} m`}
        </div>
      ) : null}
    </div>
  )
}

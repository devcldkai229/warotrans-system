import type { MapCellSet, MapCostmapImage } from './costmap'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { Edge, EdgeDirection, Endpoint, Point, RobotStatus, Zone } from '@/shared/api/contracts'
import { cx } from '@/shared/lib/cx'
import { DEFAULT_MAP_BOUNDS, type MapBounds } from '@/shared/lib/mapView'
import { Icon } from '@/shared/ui/Icon'
import { humanize } from '@/shared/lib/format'
import { MapGlyph } from './MapGlyph'
import {
  ROBOT_LENGTH_METERS,
  ROBOT_TAG_GAP,
  ROBOT_TAG_HEIGHT,
  ROBOT_WIDTH_METERS,
  computeOttoStationArchitecture,
  endpointVisualKind,
  resolveOttoRobotTagPlacements,
  visualKindColor,
  type RobotTagPlacement,
} from './ottoArchitecture'
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
  MAP_TRAIL,
  ROBOT_COLOR,
  ZONE_COLOR,
  ZONE_FILL_OPACITY,
  ZONE_LABEL,
  ZONE_ORDER,
  toPercent,
  zoneSwatchStyle,
} from './mapStyle'
import { lineStringToPoints, polygonToPoints } from './geoJson'
import { LANE_ARROW_PATH, laneGlyphs } from './laneGlyphs'
import { pointInPolygon } from './scene'
import { t } from '@/shared/i18n'
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

/**
 * Where a robot went (movement history), oldest first, with its start and end marked. Each segment is a recorded
 * stretch; between segments nothing was recorded, so that stretch is drawn faint and dashed, not as a drive.
 */
export interface MapTrail {
  segments: Point[][]
  /** Per-robot colour (replay); default: the movement-history colour. */
  color?: string
  /** A planned path (drawn dashed, thinner, no start/end marks). */
  dashed?: boolean
  /** Draw a faint link across the holes between segments (history). Off for evidence: a gap stays a gap. */
  joinGaps?: boolean
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

/** Traffic coordinator overlay (authorized edges + quarantine markers + planned Nav2 paths). */
export interface MapTrafficOverlay {
  /** Graph edge numeric ids currently under motion authority. */
  authorizedEdgeIds?: number[]
  /** Resource ids that are full / held (bay:CODE, corridor ids). */
  occupiedResourceIds?: string[]
  /** Robots in Quarantined phase — drawn as alert markers. */
  quarantinedRobotCodes?: string[]
  /** Live Nav2 plans (via TrafficSnapshot), drawn as a thin line in the robot's plan colour. */
  plannedPaths?: MapPlannedPath[]
}

/** One robot's live plan: the robot's pose first, then the Nav2 poses still ahead of it. */
export interface MapPlannedPath {
  robotCode: string
  color: string
  points: Point[]
  /** Leading points inside the traffic grant: drawn full strength; the rest is drawn fainter. */
  grantedCount: number
  /** Heading at the goal (radians, map frame), for the goal footprint. */
  goalYaw?: number | null
  /** The whole plan still waits for traffic. */
  waiting?: boolean
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
  trails?: MapTrail[]
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
  /** Costmap masks (keep-out, speed) drawn over the occupancy image, in map metres. */
  costmapImages?: MapCostmapImage[]
  /** Traffic cells per robot (held = solid tint, granted = outline). */
  cellSets?: MapCellSet[]
  /** Occupancy preview PNG (MapVersion.previewImageUri), stretched to map bounds. */
  occupancyImageUrl?: string | null
  /** Render the refreshed OTTO floor/architecture/HUD style (`otto` for `/monitor/fleet`). */
  appearance?: 'classic' | 'otto'
  className?: string
  /** HTML drawn on top of the map: positioned with `toPercent`, inside the same frame as the map. */
  children?: ReactNode
  /** Optional overlay renderer receiving the effective map bounds (expanded when wall shelves protrude). */
  renderOverlay?: (effectiveBounds: MapBounds) => ReactNode
}

// A raised dark tooltip; a warning or an alarm is the same tooltip with a ring in the tone. Always dark (its text is
// white): container-higher is a light grey in the light theme, which left the white text unreadable there.
const CALLOUT_TONE = {
  dark: 'bg-[#3a3b3c]',
  warn: 'bg-[#3a3b3c] ring-2 ring-amber',
  danger: 'bg-[#3a3b3c] ring-2 ring-red',
}

/** Map size (metres) the mark sizes below were designed for (see MAP_BOUNDS in scene.ts). */
const MARK_REFERENCE_METRES = 50

// Map chrome (Guide, zoom, coordinates): floating cards matching the console surface.
const CHROME = 'absolute z-4 bg-surface/95 shadow-float'
const OTTO_CHROME =
  'absolute z-4 border border-[var(--otto-hud-border)] bg-[var(--otto-hud-bg)] shadow-float backdrop-blur-md'
const ZOOM_BUTTON =
  'grid size-8 place-items-center rounded-full text-ink-2 transition-colors duration-200 hover:bg-container-high hover:text-ink disabled:pointer-events-none disabled:opacity-35'

function ottoTagInnerTransform(placement: RobotTagPlacement, offsetPx: number): string {
  switch (placement) {
    case 'above':
      return `translate(-50%, calc(-100% - ${offsetPx}px))`
    case 'right':
      return `translate(${offsetPx}px, -50%)`
    case 'left':
      return `translate(calc(-100% - ${offsetPx}px), -50%)`
    case 'below-far':
      return `translate(-50%, ${offsetPx + ROBOT_TAG_HEIGHT + 4}px)`
    case 'above-far':
      return `translate(-50%, calc(-100% - ${offsetPx + ROBOT_TAG_HEIGHT + 4}px))`
    case 'below':
    default:
      return `translate(-50%, ${offsetPx}px)`
  }
}

/** One map for every screen: an SVG map in metres plus an HTML overlay in the same frame. */
export function WarehouseMap({
  zones = [],
  edges = [],
  endpoints = [],
  bounds = DEFAULT_MAP_BOUNDS,
  robots = [],
  layers = {},
  labels = 'focus',
  emphasis = [],
  uiInset = 0,
  focusEndpointIds = [],
  focusRobotCodes,
  movements = [],
  trails = [],
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
  appearance = 'classic',
  costmapImages = [],
  cellSets = [],
  className,
  children,
  renderOverlay,
}: WarehouseMapProps) {
  const isOtto = appearance === 'otto'
  const maxZoom = isOtto ? 6 : 4
  const show = { zones: true, edges: true, endpoints: true, robots: true, legend: true, controls: true, coordinates: true, ...layers }
  const rawWidth = bounds.maxX - bounds.minX
  const rawHeight = bounds.maxY - bounds.minY
  const ottoArch = useMemo(
    () => (isOtto ? computeOttoStationArchitecture(endpoints, bounds, yawUnit) : null),
    [isOtto, endpoints, bounds, yawUnit],
  )
  const effectiveBounds = ottoArch ? ottoArch.expandedBounds : bounds
  const width = effectiveBounds.maxX - effectiveBounds.minX
  const height = effectiveBounds.maxY - effectiveBounds.minY
  const X = (x: number) => x - effectiveBounds.minX
  const Y = (y: number) => effectiveBounds.maxY - y
  const stagePoints = (points: Point[]) => points.map((point) => `${X(point.x)},${Y(point.y)}`).join(' ')
  // Marks (robots, endpoints, labels, lanes) are drawn in metres for a ~50 m warehouse. Smaller maps scale
  // them down so they keep the same size on screen instead of covering a 5 m room.
  const mark = Math.min(1, Math.max(rawWidth, rawHeight) / MARK_REFERENCE_METRES)
  // SVG rotate() takes degrees, clockwise on screen: map yaw is counter-clockwise, hence the minus at use.
  const yawDeg = (yaw: number) => (yawUnit === 'rad' ? (yaw * 180) / Math.PI : yaw)

  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [ownZoom, setOwnZoom] = useState(1)
  const zoom = controlledZoom ?? ownZoom
  const setZoom = (next: number) => (onZoomChange ? onZoomChange(next) : setOwnZoom(next))
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const zoomStateRef = useRef({
    zoom,
    pan,
    follow: Boolean(follow),
    onZoomChange,
    onUserPan,
  })
  useEffect(() => {
    zoomStateRef.current = {
      zoom,
      pan,
      follow: Boolean(follow),
      onZoomChange,
      onUserPan,
    }
  }, [zoom, pan, follow, onZoomChange, onUserPan])

  useEffect(() => {
    const el = stageRef.current
    if (!isOtto || !el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entriesList) => {
      const box = entriesList[0]?.contentRect
      if (!box) return
      const nextW = Math.round(box.width)
      const nextH = Math.round(box.height)
      setStageSize((prev) => (prev.width === nextW && prev.height === nextH ? prev : { width: nextW, height: nextH }))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [isOtto, width, height])

  useEffect(() => {
    const el = containerRef.current
    if (!isOtto || !el) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const state = zoomStateRef.current
      const rect = el.getBoundingClientRect()
      const prevZ = state.zoom
      const factor = event.deltaY < 0 ? 1.16 : 1 / 1.16
      const nextZ = Math.min(6, Math.max(1, Number((prevZ * factor).toFixed(3))))
      if (Math.abs(nextZ - prevZ) < 1e-4) return
      const dx = event.clientX - (rect.left + rect.width / 2)
      const dy = event.clientY - (rect.top + rect.height / 2)
      const lx = (dx - state.pan.x) / prevZ
      const ly = (dy - state.pan.y) / prevZ
      const stageW = stageRef.current?.offsetWidth ?? 0
      const stageH = stageRef.current?.offsetHeight ?? 0
      const rawPan = nextZ <= 1.001 ? { x: 0, y: 0 } : { x: dx - lx * nextZ, y: dy - ly * nextZ }
      const maxX = stageW > 0 ? (stageW * nextZ) / 2 : 0
      const maxY = stageH > 0 ? (stageH * nextZ) / 2 : 0
      const boundedPan =
        nextZ <= 1.001 || stageW <= 0 || stageH <= 0
          ? { x: 0, y: 0 }
          : {
              x: Math.max(-maxX, Math.min(maxX, rawPan.x)),
              y: Math.max(-maxY, Math.min(maxY, rawPan.y)),
            }
      if (state.follow) state.onUserPan?.()
      if (state.onZoomChange) state.onZoomChange(nextZ)
      else setOwnZoom(nextZ)
      setPan(boundedPan)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [isOtto])

  // Follow: pan so `follow` sits in the frame centre.
  const followX = follow?.x
  const followY = follow?.y
  useEffect(() => {
    if (followX === undefined || followY === undefined) return
    const stageW = stageRef.current?.offsetWidth ?? 0
    const stageH = stageRef.current?.offsetHeight ?? 0
    if (stageW === 0 || stageH === 0 || width <= 0 || height <= 0) return
    if (isOtto) {
      const localX = ((followX - effectiveBounds.minX) / width) * stageW
      const localY = ((effectiveBounds.maxY - followY) / height) * stageH
      setPan({ x: -(localX - stageW / 2) * zoom, y: -(localY - stageH / 2) * zoom })
    } else {
      const k = stageW / Math.max(width, height)
      const localX = (stageW - width * k) / 2 + (followX - effectiveBounds.minX) * k
      const localY = (stageW - height * k) / 2 + (effectiveBounds.maxY - followY) * k
      setPan({ x: -(localX - stageW / 2) * zoom, y: -(localY - stageW / 2) * zoom })
    }
  }, [followX, followY, zoom, width, height, effectiveBounds.minX, effectiveBounds.maxY, isOtto])
  const [cursor, setCursor] = useState<Point | null>(null)
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null)
  const [hoveredEndpointId, setHoveredEndpointId] = useState<string | null>(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const dragged = useRef(false)

  const toMetres = (clientX: number, clientY: number): Point | null => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    return {
      x: effectiveBounds.minX + ((clientX - rect.left) / rect.width) * width,
      y: effectiveBounds.maxY - ((clientY - rect.top) / rect.height) * height,
    }
  }

  function startPan(event: ReactPointerEvent) {
    dragged.current = false
    // Chrome and overlay widgets keep their own pointer handling; callouts are see-through.
    if (zoom <= 1 || (event.target as HTMLElement).closest('[data-map-ui], [data-map-overlay] > :not([data-map-tip])')) return
    const start = { x: event.clientX - pan.x, y: event.clientY - pan.y }
    const startX = event.clientX
    const startY = event.clientY
    const stageW = stageRef.current?.offsetWidth ?? stageSize.width
    const stageH = stageRef.current?.offsetHeight ?? stageSize.height
    const move = (moveEvent: PointerEvent) => {
      if (!dragged.current && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 4) {
        dragged.current = true
        onUserPan?.()
      }
      if (dragged.current) {
        const nextPan = { x: moveEvent.clientX - start.x, y: moveEvent.clientY - start.y }
        if (isOtto && stageW > 0 && stageH > 0) {
          const maxX = (stageW * zoom) / 2
          const maxY = (stageH * zoom) / 2
          setPan({
            x: Math.max(-maxX, Math.min(maxX, nextPan.x)),
            y: Math.max(-maxY, Math.min(maxY, nextPan.y)),
          })
        } else {
          setPan(nextPan)
        }
      }
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  function changeZoom(next: number) {
    const clamped = Math.min(maxZoom, Math.max(1, next))
    setZoom(clamped)
    if (clamped === 1 && !follow) setPan({ x: 0, y: 0 })
  }

  // A controlled zoom back to 1 recentres the map too (unless following).
  useEffect(() => {
    if (zoom === 1 && !follow) setPan({ x: 0, y: 0 })
  }, [zoom, follow])

  // Occupancy for SINGLE_OCCUPANCY zones only (rules/05: no Edge/Zone capacity column).
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

  const focused = new Set(focusEndpointIds)
  const layerOpacity = (layer: MapEmphasis) => (emphasis.length > 0 && !emphasis.includes(layer) ? 0.28 : 1)
  const robotFaded = (code: string) => (focusRobotCodes ? !focusRobotCodes.includes(code) : false)

  const present = {
    zones: ZONE_ORDER.filter((type) => zones.some((zone) => zone.zoneType === type)),
    robots: Array.from(new Set(robots.map((robot) => robot.status))),
    edges: Array.from(new Set(edges.map((edge) => edge.direction))),
    endpointTypes: Array.from(new Set(endpoints.map((endpoint) => endpoint.endpointType))),
  }

  const basePxPerMetre = isOtto && stageSize.width > 0 && width > 0 ? stageSize.width / width : 110
  const ottoStrokeUnit = 1 / Math.max(20, basePxPerMetre * Math.sqrt(Math.max(1, zoom)))
  const ottoHatchStep = 6.5 / Math.max(8, basePxPerMetre * Math.sqrt(Math.max(1, zoom)))
  const ottoRobotLenM = Math.max(ROBOT_LENGTH_METERS, 22 / Math.max(20, basePxPerMetre))
  const ottoRobotWidM = ottoRobotLenM * (ROBOT_WIDTH_METERS / ROBOT_LENGTH_METERS)
  const ottoEndpointSizeM = Math.max(0.18, Math.min(0.24, 21 / Math.max(20, basePxPerMetre)))
  const ottoTagBaseRadiusPx = ottoRobotLenM * 0.5 * 1.24 * basePxPerMetre
  const ottoTagOffsetPx = (ottoTagBaseRadiusPx + 3) * zoom + ROBOT_TAG_GAP

  const ottoTagLayouts = useMemo(() => {
    if (!isOtto || robots.length === 0 || stageSize.width <= 0 || stageSize.height <= 0) return {}
    return resolveOttoRobotTagPlacements(
      robots.map((robot) => ({
        id: robot.code,
        code: robot.code,
        x: ((robot.x - effectiveBounds.minX) / Math.max(1e-6, width)) * stageSize.width,
        y: (1 - (robot.y - effectiveBounds.minY) / Math.max(1e-6, height)) * stageSize.height,
        isSelected: selected.robotCode === robot.code,
      })),
      ottoTagBaseRadiusPx,
      zoom,
      1,
    )
  }, [
    isOtto,
    robots,
    stageSize.width,
    stageSize.height,
    effectiveBounds.minX,
    effectiveBounds.minY,
    width,
    height,
    selected.robotCode,
    ottoTagBaseRadiusPx,
    zoom,
  ])

  const stageAspect = width / Math.max(1e-6, height)
  const stageStyle: CSSProperties = isOtto
    ? {
        width: `min(calc(100cqw - 24px), calc((100cqh - 24px) * ${stageAspect}))`,
        height: `min(calc(100cqh - 24px), calc((100cqw - 24px) / ${stageAspect}))`,
        transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        ['--z' as string]: zoom,
      }
    : {
        transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        ['--z' as string]: zoom,
      }

  // A label chip is sized from its text: SVG text cannot carry its own background.
  const chipWidth = (text: string, fontSize: number) => text.length * fontSize * 0.56 + fontSize * 0.9

  return (
    <div
      ref={containerRef}
      className={cx(
        'relative size-full min-h-0 overflow-hidden select-none [container-type:size]',
        isOtto ? 'bg-[var(--otto-canvas-bg)]' : 'bg-container',
        zoom > 1 && 'cursor-grab',
        className,
      )}
      onPointerDown={startPan}
      onDoubleClick={
        isOtto
          ? (event) => {
              if ((event.target as HTMLElement).closest('[data-map-ui], [data-map-overlay] > :not([data-map-tip])')) return
              changeZoom(zoom > 1.2 ? 1 : 2.2)
            }
          : undefined
      }
      onClickCapture={(event) => {
        if (dragged.current) {
          event.stopPropagation()
          dragged.current = false
        }
      }}
    >
      {isOtto ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle, var(--otto-grid-dot) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
      ) : null}
      <div
        ref={stageRef}
        className={cx(
          'absolute top-1/2 left-1/2 origin-center',
          !isOtto && 'size-[min(100cqw,100cqh)]',
        )}
        style={stageStyle}
      >
        <svg
          ref={svgRef}
          className={cx(
            'block size-full tracking-normal',
            isOtto ? 'rounded-md' : 'rounded-md ring-1 ring-outline-soft',
          )}
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
              <line x1="0" y1="0" x2="0" y2="1" stroke={ZONE_COLOR.KEEP_OUT} strokeOpacity={0.55} strokeWidth="0.35" />
            </pattern>
            <pattern
              id="wmap-otto-hatch"
              width={ottoHatchStep}
              height={ottoHatchStep}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={ottoHatchStep}
                stroke={ZONE_COLOR.KEEP_OUT}
                strokeOpacity={0.62}
                strokeWidth={ottoHatchStep * 0.28}
              />
            </pattern>
            <pattern id="wmap-dots" width="5" height="5" patternUnits="userSpaceOnUse">
              <circle cx="0" cy="0" r="0.09" fill={MAP_LINE} />
            </pattern>
            <marker id="wmap-move" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth={0.9 * mark} markerHeight={0.9 * mark} orient="auto">
              <path d="M1 1 9 5 1 9Z" fill={MAP_INK} />
            </marker>
          </defs>

          {isOtto ? (
            <>
              <rect
                x={X(bounds.minX)}
                y={Y(bounds.maxY)}
                width={rawWidth}
                height={rawHeight}
                fill={MAP_PAPER}
              />
              {occupancyImageUrl ? (
                <image
                  href={occupancyImageUrl}
                  x={X(bounds.minX)}
                  y={Y(bounds.maxY)}
                  width={rawWidth}
                  height={rawHeight}
                  preserveAspectRatio="none"
                  opacity={0.9}
                  style={{ pointerEvents: 'none', filter: MAP_IMAGE_FILTER, imageRendering: 'pixelated' }}
                />
              ) : (
                <rect x={X(bounds.minX)} y={Y(bounds.maxY)} width={rawWidth} height={rawHeight} fill="url(#wmap-dots)" />
              )}
              <rect
                x={X(bounds.minX)}
                y={Y(bounds.maxY)}
                width={rawWidth}
                height={rawHeight}
                fill="none"
                stroke="var(--otto-floor-stroke)"
                strokeWidth={ottoStrokeUnit * 1.1}
                pointerEvents="none"
              />
              {ottoArch && ottoArch.shelfBays.length > 0 ? (
                <g pointerEvents="none">
                  {ottoArch.shelfBays.map((bay) => {
                    const bx = X(bay.minX)
                    const by = Y(bay.maxY)
                    const bw = bay.maxX - bay.minX
                    const bh = bay.maxY - bay.minY
                    const isHoriz = bay.wall === 'top' || bay.wall === 'bottom'
                    return (
                      <g key={`shelf-${bay.id}`}>
                        {bay.connector ? (
                          <line
                            x1={X(bay.connector.x1)}
                            y1={Y(bay.connector.y1)}
                            x2={X(bay.connector.x2)}
                            y2={Y(bay.connector.y2)}
                            stroke="var(--otto-bay-stroke)"
                            strokeOpacity={0.55}
                            strokeWidth={ottoStrokeUnit * 0.9}
                            strokeDasharray={`${ottoStrokeUnit * 3} ${ottoStrokeUnit * 2.5}`}
                          />
                        ) : null}
                        <rect
                          x={bx}
                          y={by}
                          width={bw}
                          height={bh}
                          rx={ottoStrokeUnit * 2}
                          fill="var(--otto-shelf-fill)"
                          stroke="var(--otto-shelf-stroke)"
                          strokeWidth={ottoStrokeUnit}
                        />
                        {isHoriz ? (
                          <line
                            x1={bx}
                            y1={by + bh / 2}
                            x2={bx + bw}
                            y2={by + bh / 2}
                            stroke="var(--otto-shelf-slot)"
                            strokeWidth={ottoStrokeUnit * 0.8}
                          />
                        ) : (
                          <line
                            x1={bx + bw / 2}
                            y1={by}
                            x2={bx + bw / 2}
                            y2={by + bh}
                            stroke="var(--otto-shelf-slot)"
                            strokeWidth={ottoStrokeUnit * 0.8}
                          />
                        )}
                        {Array.from({ length: bay.slots - 1 }, (_, slotIdx) => {
                          const ratio = (slotIdx + 1) / bay.slots
                          return isHoriz ? (
                            <line
                              key={slotIdx}
                              x1={bx + bw * ratio}
                              y1={by}
                              x2={bx + bw * ratio}
                              y2={by + bh}
                              stroke="var(--otto-shelf-slot)"
                              strokeWidth={ottoStrokeUnit * 0.75}
                            />
                          ) : (
                            <line
                              key={slotIdx}
                              x1={bx}
                              y1={by + bh * ratio}
                              x2={bx + bw}
                              y2={by + bh * ratio}
                              stroke="var(--otto-shelf-slot)"
                              strokeWidth={ottoStrokeUnit * 0.75}
                            />
                          )
                        })}
                        <line
                          x1={X(bay.opening.x1)}
                          y1={Y(bay.opening.y1)}
                          x2={X(bay.opening.x2)}
                          y2={Y(bay.opening.y2)}
                          stroke="var(--otto-shelf-stroke)"
                          strokeWidth={ottoStrokeUnit * 1.4}
                        />
                      </g>
                    )
                  })}
                </g>
              ) : null}
              {ottoArch && ottoArch.dockBays.length > 0 ? (
                <g pointerEvents="none">
                  {ottoArch.dockBays.map((bay) => {
                    const hw = bay.width / 2
                    const hl = bay.length / 2
                    const c = Math.min(hw, hl) * 0.45
                    const accent = visualKindColor(bay.kind)
                    return (
                      <g
                        key={`dock-${bay.id}`}
                        transform={`translate(${X(bay.x)} ${Y(bay.y)}) rotate(${bay.headingDeg})`}
                      >
                        <rect
                          x={-hw}
                          y={-hl}
                          width={bay.width}
                          height={bay.length}
                          rx={Math.min(hw, hl) * 0.14}
                          fill="var(--otto-bay-fill)"
                        />
                        <path
                          d={`M${-hw} ${-hl + c} L${-hw} ${-hl} L${-hw + c} ${-hl} M${hw - c} ${-hl} L${hw} ${-hl} L${hw} ${-hl + c} M${-hw} ${hl - c} L${-hw} ${hl} L${-hw + c} ${hl} M${hw - c} ${hl} L${hw} ${hl} L${hw} ${hl - c}`}
                          fill="none"
                          stroke={bay.kind === 'CHARGER' || bay.kind === 'INBOUND' || bay.kind === 'OUTBOUND' ? accent : 'var(--otto-bay-stroke)'}
                          strokeOpacity={0.72}
                          strokeWidth={ottoStrokeUnit * 1.05}
                          strokeLinecap="round"
                        />
                      </g>
                    )
                  })}
                </g>
              ) : null}
            </>
          ) : (
            <>
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
            </>
          )}

          {/* Costmap: the bundle's keep-out / speed masks, then the traffic cells each robot holds or was granted. */}
          {costmapImages.map((img) => (
            <image
              key={`costmap-${img.id}`}
              href={img.url}
              x={X(img.originX)}
              y={Y(img.originY + img.heightM)}
              width={img.widthM}
              height={img.heightM}
              preserveAspectRatio="none"
              opacity={img.opacity ?? 1}
              style={{ pointerEvents: 'none', imageRendering: 'pixelated' }}
            />
          ))}
          {cellSets.length > 0 ? (
            <g pointerEvents="none">
              {cellSets.map((set) =>
                set.cells.map((c) => (
                  <rect
                    key={`cell-${set.robotCode}-${set.kind}-${c.x}-${c.y}`}
                    x={X(c.x)}
                    y={Y(c.y + set.size)}
                    width={set.size}
                    height={set.size}
                    fill={set.kind === 'held' ? set.color : 'none'}
                    fillOpacity={set.kind === 'held' ? 0.28 : 0}
                    stroke={set.color}
                    strokeOpacity={set.kind === 'held' ? 0.5 : 0.85}
                    strokeWidth={0.012}
                  />
                )),
              )}
            </g>
          ) : null}

          {/* Zones: soft tinted areas with dashed rule borders (OTTO) and hover-only anchor dots. */}
          {show.zones ? (
            <g opacity={layerOpacity('zones')}>
              {zones.map((zone) => {
                const points = polygonToPoints(zone.geometry)
                const load = zoneLoad.get(zone.id) ?? 0
                const exclusive = zone.zoneType === 'SINGLE_OCCUPANCY'
                const over = show.occupancy && exclusive && load > 1
                const full = show.occupancy && exclusive && load === 1
                const isSelected = selected.zoneId === zone.id
                const isHovered = hoveredZoneId === zone.id
                const isKeepOut = zone.zoneType === 'KEEP_OUT'
                const anchor = zoneCentroid(points)

                const baseFillOpacity = exclusive
                  ? 0.22
                  : Math.min(ZONE_FILL_OPACITY[zone.zoneType], isKeepOut ? 0.16 : 0.15)
                const activeStrokeOpacity = isSelected
                  ? 0.96
                  : isHovered
                    ? exclusive
                      ? 0.92
                      : 0.88
                    : exclusive
                      ? 0.84
                      : 0.68
                const activeStrokeWidth =
                  (isSelected ? 2 : isHovered ? (exclusive ? 1.6 : 1.5) : exclusive ? 1.35 : 1.15) * ottoStrokeUnit
                const ottoPaint = over
                  ? {
                      fill: MAP_RED,
                      fillOpacity: 0.18,
                      stroke: MAP_RED,
                      strokeOpacity: 0.96,
                      strokeWidth: 2 * ottoStrokeUnit,
                    }
                  : full
                    ? {
                        fill: MAP_AMBER,
                        fillOpacity: 0.2,
                        stroke: MAP_AMBER,
                        strokeOpacity: isSelected ? 0.96 : isHovered ? 0.88 : 0.68,
                        strokeWidth: (isSelected ? 2 : isHovered ? 1.5 : 1.15) * ottoStrokeUnit,
                      }
                    : !zone.isActive
                      ? {
                          fill: MAP_OFF,
                          fillOpacity: 0.08,
                          stroke: MAP_OFF,
                          strokeOpacity: isSelected ? 0.96 : isHovered ? 0.88 : 0.68,
                          strokeWidth: (isSelected ? 2 : isHovered ? 1.5 : 1.15) * ottoStrokeUnit,
                        }
                      : {
                          fill: 'currentColor',
                          fillOpacity: baseFillOpacity + (isHovered || isSelected ? 0.06 : 0),
                          stroke: 'currentColor',
                          strokeOpacity: activeStrokeOpacity,
                          strokeWidth: activeStrokeWidth,
                        }

                const ottoDash = !zone.isActive
                  ? `${3 * ottoStrokeUnit} ${3 * ottoStrokeUnit}`
                  : isKeepOut || isSelected || over
                    ? undefined
                    : `${4.5 * ottoStrokeUnit} ${3.2 * ottoStrokeUnit}`

                // Classic mode: switched off, then full, then over capacity; a selection only thickens the edge.
                const classicPaint = over
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
                    {isOtto ? (
                      <polygon
                        points={stagePoints(points)}
                        strokeLinejoin="round"
                        strokeDasharray={ottoDash}
                        {...ottoPaint}
                      />
                    ) : (
                      <polygon
                        points={stagePoints(points)}
                        strokeLinejoin="round"
                        strokeDasharray={zone.isActive ? undefined : `${0.5 * mark} ${0.4 * mark}`}
                        {...classicPaint}
                        {...(isSelected ? { stroke: 'currentColor', strokeOpacity: 1, strokeWidth: 0.32 * mark } : null)}
                      />
                    )}
                    {isKeepOut ? (
                      <polygon points={stagePoints(points)} fill={isOtto ? 'url(#wmap-otto-hatch)' : 'url(#wmap-hatch)'} stroke="none" />
                    ) : null}
                    {isOtto ? (
                      isHovered ? (
                        <circle
                          cx={X(anchor.x)}
                          cy={Y(anchor.y)}
                          r={3.2 * ottoStrokeUnit}
                          fill={ottoPaint.stroke}
                          stroke={MAP_HALO}
                          strokeWidth={1.2 * ottoStrokeUnit}
                          pointerEvents="none"
                        />
                      ) : null
                    ) : (
                      <circle
                        cx={X(anchor.x)}
                        cy={Y(anchor.y)}
                        r={0.28 * mark}
                        fill="currentColor"
                        stroke={MAP_HALO}
                        strokeWidth={0.1 * mark}
                      />
                    )}
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
                        d={LANE_ARROW_PATH}
                        fill="currentColor"
                        fillOpacity={LANE_CHEVRON_OPACITY}
                        stroke="none"
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

          {/* Live Nav2 plans: one thin line per robot in its plan colour. The part traffic has granted is drawn full
              strength, the part still waiting for traffic fainter. */}
          {trafficOverlay?.plannedPaths && trafficOverlay.plannedPaths.length > 0 ? (
            <g pointerEvents="none" fill="none" strokeLinecap="round" strokeLinejoin="round">
              {trafficOverlay.plannedPaths.map((plan) => {
                if (plan.points.length < 2) return null
                const focused = !focusRobotCodes || focusRobotCodes.length === 0 || focusRobotCodes.includes(plan.robotCode)
                const line = 0.16 * mark
                const granted = plan.points.slice(0, Math.max(0, plan.grantedCount))
                const ahead = plan.points.slice(Math.max(0, plan.grantedCount - 1))
                return (
                  <g key={`plan-${plan.robotCode}`} opacity={focused ? 1 : 0.3} stroke={plan.color} strokeWidth={line}>
                    {ahead.length >= 2 ? <polyline points={stagePoints(ahead)} strokeOpacity={0.4} /> : null}
                    {granted.length >= 2 ? <polyline points={stagePoints(granted)} strokeOpacity={0.95} /> : null}
                  </g>
                )
              })}
            </g>
          ) : null}

          {/* Trails (movement history): the path, a hollow dot where it starts and a filled one where it ends. */}
          {trails.length > 0 ? (
            <g pointerEvents="none">
              {trails.map((trail, index) => {
                const segments = trail.segments.filter((segment) => segment.length > 0)
                if (segments.length === 0) return null
                const first = segments[0][0]
                const lastSegment = segments[segments.length - 1]
                const last = lastSegment[lastSegment.length - 1]
                const stroke = trail.color ?? MAP_TRAIL
                return (
                  <g key={index}>
                    {(trail.joinGaps ?? true) && !trail.dashed && segments.slice(1).map((segment, gap) => {
                      const before = segments[gap][segments[gap].length - 1]
                      return (
                        <line
                          key={`gap-${gap}`}
                          x1={X(before.x)}
                          y1={Y(before.y)}
                          x2={X(segment[0].x)}
                          y2={Y(segment[0].y)}
                          stroke={stroke}
                          strokeWidth={0.14 * mark}
                          strokeDasharray={`${0.35 * mark} ${0.35 * mark}`}
                          opacity={0.45}
                        />
                      )
                    })}
                    {segments.map((segment, part) => (
                      <polyline
                        key={part}
                        points={segment.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={(trail.dashed ? 0.16 : 0.28) * mark}
                        strokeDasharray={trail.dashed ? `${0.5 * mark} ${0.4 * mark}` : undefined}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={trail.dashed ? 0.75 : 0.9}
                      />
                    ))}
                    {trail.dashed ? null : (
                      <>
                        <circle cx={X(first.x)} cy={Y(first.y)} r={0.45 * mark} fill={MAP_PAPER} stroke={stroke} strokeWidth={0.22 * mark} />
                        <circle cx={X(last.x)} cy={Y(last.y)} r={0.45 * mark} fill={stroke} stroke={MAP_PAPER} strokeWidth={0.15 * mark} />
                      </>
                    )}
                  </g>
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
              {isOtto
                ? endpoints.map((endpoint) => {
                    const kind = endpointVisualKind(endpoint)
                    const accent = visualKindColor(kind)
                    const isFocus = focused.has(endpoint.id)
                    const isSelected = selected.endpointId === endpoint.id
                    const isHovered = hoveredEndpointId === endpoint.id
                    const tileHalf = ottoEndpointSizeM / 2
                    const chevBase = tileHalf + ottoEndpointSizeM * 0.14
                    const chevH = ottoEndpointSizeM * 0.22
                    const chevW = ottoEndpointSizeM * 0.15
                    const headingDeg = 90 - yawDeg(endpoint.yaw)
                    return (
                      <g
                        key={endpoint.id}
                        color={accent}
                        opacity={endpoint.isEnabled ? undefined : 0.36}
                        className="cursor-pointer"
                        transform={`translate(${X(endpoint.x)} ${Y(endpoint.y)})`}
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
                        {isFocus || isSelected || isHovered ? (
                          <circle r={ottoEndpointSizeM * 0.96} fill="currentColor" fillOpacity={0.14} />
                        ) : null}
                        <g transform={`rotate(${headingDeg})`}>
                          <path
                            d={`M0 ${-chevBase - chevH} L${chevW} ${-chevBase} L${-chevW} ${-chevBase} Z`}
                            fill="currentColor"
                            opacity={0.82}
                          />
                        </g>
                        <g transform={isFocus ? 'scale(1.16)' : undefined}>
                          <rect
                            x={-tileHalf}
                            y={-tileHalf}
                            width={ottoEndpointSizeM}
                            height={ottoEndpointSizeM}
                            rx={ottoEndpointSizeM * 0.26}
                            fill={isFocus ? 'currentColor' : MAP_CARD}
                            stroke={isFocus ? MAP_HALO : 'currentColor'}
                            strokeWidth={ottoStrokeUnit * (isSelected ? 1.65 : 1.05)}
                          />
                          <g color={isFocus ? '#fff' : undefined} pointerEvents="none">
                            <MapGlyph icon={kind} size={ottoEndpointSizeM * 0.62} />
                          </g>
                        </g>
                      </g>
                    )
                  })
                : endpoints.map((endpoint) => {
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

          {/* Robots: OTTO top-down AMR chassis when `otto`, classic circle glyph otherwise. */}
          {show.robots ? (
            <g>
              {isOtto
                ? robots.map((robot) => {
                    const isSelectedRobot = selected.robotCode === robot.code
                    const hw = ottoRobotWidM / 2
                    const hl = ottoRobotLenM / 2
                    const noseH = ottoRobotLenM * 0.22
                    const noseW = ottoRobotWidM * 0.22
                    const rotDeg = 90 - yawDeg(robot.yaw)
                    return (
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
                        <circle
                          r={ottoRobotLenM * (isSelectedRobot ? 0.72 : 0.6)}
                          fill={robot.alert ? MAP_RED : 'currentColor'}
                          fillOpacity={robot.alert ? 0.22 : 0.14}
                          className={
                            robot.alert
                              ? 'origin-center animate-robot-pulse [transform-box:fill-box] motion-reduce:animate-none'
                              : undefined
                          }
                        />
                        {isSelectedRobot ? (
                          <circle
                            r={ottoRobotLenM * 0.72}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={ottoStrokeUnit * 1.15}
                            strokeDasharray={`${ottoStrokeUnit * 3} ${ottoStrokeUnit * 2.2}`}
                          />
                        ) : robot.alert ? (
                          <circle
                            r={ottoRobotLenM * 0.68}
                            fill="none"
                            stroke={MAP_RED}
                            strokeWidth={ottoStrokeUnit * 1.15}
                          />
                        ) : null}
                        <g transform={`rotate(${rotDeg})`}>
                          <path
                            d={`M0 ${-hl - noseH} L${noseW} ${-hl - ottoStrokeUnit * 0.4} L${-noseW} ${-hl - ottoStrokeUnit * 0.4} Z`}
                            fill="currentColor"
                          />
                          <rect
                            x={-hw}
                            y={-hl}
                            width={ottoRobotWidM}
                            height={ottoRobotLenM}
                            rx={ottoRobotWidM * 0.24}
                            fill="var(--otto-chassis-fill)"
                            stroke="var(--otto-chassis-stroke)"
                            strokeWidth={ottoStrokeUnit * 1.15}
                          />
                          <rect
                            x={-hw * 0.82}
                            y={-hl + ottoRobotLenM * 0.05}
                            width={ottoRobotWidM * 0.82}
                            height={ottoRobotLenM * 0.18}
                            rx={ottoRobotLenM * 0.06}
                            fill="currentColor"
                          />
                          <rect
                            x={-ottoRobotWidM * 0.3}
                            y={-ottoRobotLenM * 0.16}
                            width={ottoRobotWidM * 0.6}
                            height={ottoRobotLenM * 0.46}
                            rx={ottoRobotWidM * 0.12}
                            fill="var(--otto-deck-fill)"
                            stroke="var(--otto-deck-stroke)"
                            strokeWidth={ottoStrokeUnit * 0.75}
                          />
                          <rect
                            x={-ottoRobotWidM * 0.14}
                            y={ottoRobotLenM * 0.03}
                            width={ottoRobotWidM * 0.28}
                            height={ottoRobotLenM * 0.09}
                            rx={ottoRobotLenM * 0.04}
                            fill="currentColor"
                            fillOpacity={0.5}
                          />
                        </g>
                      </g>
                    )
                  })
                : robots.map((robot) => (
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
          {isOtto && show.robots
            ? robots.map((robot) => {
                const placement = ottoTagLayouts[robot.code]?.placement ?? 'below'
                const isSelectedRobot = selected.robotCode === robot.code
                const faded = robotFaded(robot.code)
                const innerTransform = ottoTagInnerTransform(placement, ottoTagOffsetPx)
                return (
                  <div
                    key={`otto-tag-${robot.code}`}
                    className={cx('absolute', isSelectedRobot ? 'z-5' : 'z-4')}
                    style={{
                      ...toPercent({ x: robot.x, y: robot.y }, effectiveBounds),
                      width: 0,
                      height: 0,
                      transform: 'scale(calc(1 / var(--z, 1)))',
                      opacity: faded ? 0.3 : 1,
                    }}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onRobotClick?.(robot.code)
                      }}
                      style={{ transform: innerTransform }}
                      className={cx(
                        'inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[11px] font-semibold tracking-tight whitespace-nowrap shadow-sm backdrop-blur-sm transition-colors',
                        isSelectedRobot
                          ? 'border-transparent bg-[var(--otto-tag-selected-bg)] text-[var(--otto-tag-selected-ink)]'
                          : 'border-[var(--otto-tag-border)] bg-[var(--otto-tag-bg)] text-ink hover:border-outline',
                        robot.alert && !isSelectedRobot && 'ring-1 ring-red',
                      )}
                    >
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: ROBOT_COLOR[robot.status] }}
                      />
                      <span className="tabular-nums">{robot.code}</span>
                      {robot.alert ? <span className="size-1.5 shrink-0 rounded-full bg-red" aria-hidden /> : null}
                    </button>
                  </div>
                )
              })
            : null}
          {show.zones && hoveredZoneId
            ? zones
                .filter((zone) => zone.id === hoveredZoneId)
                .map((zone) => {
                  const anchor = zoneCentroid(polygonToPoints(zone.geometry))
                  const load = zoneLoad.get(zone.id) ?? 0
                  const occupancyLine =
                    zone.zoneType === 'KEEP_OUT'
                      ? t('No entry')
                      : zone.zoneType === 'SINGLE_OCCUPANCY'
                        ? show.occupancy
                          ? t('{load}/1 robots', { load })
                          : t('1 robot')
                        : show.occupancy
                          ? t('{load} robots', { load })
                          : '—'
                  return (
                    <MapNameCallout
                      key={zone.id}
                      title={zone.name}
                      accent={ZONE_COLOR[zone.zoneType]}
                      anchor={anchor}
                      bounds={effectiveBounds}
                      otto={isOtto}
                      details={[
                        { label: t('Type'), value: ZONE_LABEL[zone.zoneType] },
                        { label: t('Occupancy'), value: occupancyLine },
                        ...(show.occupancy && zone.maxSpeed != null
                          ? [{ label: t('Max'), value: `${zone.maxSpeed} m/s` }]
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
                    accent={isOtto ? visualKindColor(endpointVisualKind(endpoint)) : ENDPOINT_COLOR[endpoint.endpointType]}
                    anchor={{ x: endpoint.x, y: endpoint.y }}
                    bounds={effectiveBounds}
                    otto={isOtto}
                    details={[
                      { label: t('Type'), value: ENDPOINT_NAME[endpoint.endpointType] },
                      { label: t('Code'), value: endpoint.code },
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
                  return (
                    <MapNameCallout
                      key={edge.id}
                      title={edge.name || edge.code}
                      accent={EDGE_COLOR[edge.direction]}
                      anchor={mid}
                      bounds={effectiveBounds}
                      otto={isOtto}
                      details={[
                        {
                          label: t('Type'),
                          value: edge.direction === 'ONE_WAY' ? t('One-way edge') : t('Two-way edge'),
                        },
                        { label: t('Code'), value: edge.code },
                        ...(edge.maxSpeed != null ? [{ label: t('Max'), value: `${edge.maxSpeed} m/s` }] : []),
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
              style={toPercent({ x: callout.x, y: callout.y }, effectiveBounds)}
            >
              {callout.lines.map((line, lineIndex) => (
                <span key={lineIndex} className={lineIndex === 0 ? 'font-medium' : 'opacity-80'}>
                  {line}
                </span>
              ))}
            </div>
          ))}
          {renderOverlay ? renderOverlay(effectiveBounds) : children}
        </div>
      </div>

      {show.legend ? (
        <details
          data-map-ui
          className={cx(CHROME, 'top-3 left-3 min-w-40 rounded-md px-3.5 py-2.5 text-xs text-ink-2')}
          open={show.legendOpen ? true : undefined}
        >
          <summary className="font-medium text-ink">{t('Guide')}</summary>
          {present.robots.length > 0 ? (
            <GuideSection title={t('Robots')}>
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
            <GuideSection title={t('Zones')}>
              {present.zones.map((type) => (
                <GuideItem key={type} label={ZONE_LABEL[type]}>
                  <i className="size-2.5 shrink-0 rounded-xs border-[1.5px]" style={zoneSwatchStyle(type)} />
                </GuideItem>
              ))}
            </GuideSection>
          ) : null}
          {show.edges && present.edges.length > 0 ? (
            <GuideSection title={t('Paths')}>
              {present.edges.map((direction) => (
                <GuideItem key={direction} label={direction === 'ONE_WAY' ? t('One-way edge') : t('Two-way edge')}>
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
            <GuideSection title={t('Endpoints')} note={t('The wedge shows the arrival heading.')} columns>
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
        <div
          data-map-ui
          className={cx(isOtto ? OTTO_CHROME : CHROME, 'bottom-3 flex flex-col rounded-full p-1')}
          style={{ right: 12 + uiInset }}
        >
          <button type="button" className={ZOOM_BUTTON} aria-label={t('Zoom in')} disabled={zoom >= maxZoom} onClick={() => changeZoom(zoom + 0.5)}>
            <Icon name="plus" size={15} />
          </button>
          <button type="button" className={ZOOM_BUTTON} aria-label={t('Zoom out')} disabled={zoom <= 1} onClick={() => changeZoom(zoom - 0.5)}>
            <Icon name="minus" size={15} />
          </button>
          <button
            type="button"
            className={ZOOM_BUTTON}
            aria-label={t('Reset view')}
            disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
            onClick={() => changeZoom(1)}
          >
            <Icon name={isOtto ? 'fit' : 'crosshair'} size={15} />
          </button>
        </div>
      ) : null}

      {show.coordinates ? (
        <div
          data-map-ui
          className={cx(
            isOtto ? OTTO_CHROME : CHROME,
            'pointer-events-none bottom-3 left-3 rounded-full px-3 py-1 font-mono text-xs text-ink-2 tabular-nums',
          )}
        >
          {cursor && cursor.x >= bounds.minX && cursor.x <= bounds.maxX && cursor.y >= bounds.minY && cursor.y <= bounds.maxY
            ? `x ${cursor.x.toFixed(1)} m, y ${cursor.y.toFixed(1)} m`
            : `${Number(rawWidth.toFixed(1))} × ${Number(rawHeight.toFixed(1))} m`}
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
  otto = false,
  details,
}: {
  title: string
  accent: string
  anchor: Point
  bounds: MapBounds
  otto?: boolean
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
          'absolute w-max max-w-none px-2.5 py-1.5 text-xs whitespace-nowrap text-ink shadow-float',
          otto
            ? 'rounded-lg border border-[var(--otto-hud-border)] bg-[var(--otto-hud-bg)] backdrop-blur-md'
            : 'rounded-sm border border-outline-soft bg-surface/95 ring-1 ring-amber/40',
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
            'absolute size-1.5 rotate-45',
            otto ? 'border-[var(--otto-hud-border)] bg-[var(--otto-hud-bg)]' : 'border-outline-soft bg-surface',
            vertical === 'above' ? 'bottom-[-3px] border-r border-b' : 'top-[-3px] border-l border-t',
            horizontal === 'right' ? 'left-2' : 'right-2',
          )}
        />
      </div>
    </div>
  )
}

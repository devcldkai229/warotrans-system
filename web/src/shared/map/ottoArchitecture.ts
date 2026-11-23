import type { Endpoint } from '@/shared/api/contracts'
import { t } from '@/shared/i18n'
import type { MapBounds } from '@/shared/lib/mapView'

/** Nav2 robot footprint dimensions in metres (aligned with backend TrafficFootprintOptions). */
export const ROBOT_LENGTH_METERS = 0.32
export const ROBOT_WIDTH_METERS = 0.26
export const DOCK_BAY_LENGTH_METERS = 0.4
export const DOCK_BAY_WIDTH_METERS = 0.34
export const SHELF_BAY_DEPTH_METERS = 0.35
export const SHELF_BAY_LENGTH_METERS = 0.7

export const ROBOT_TAG_WIDTH = 104
export const ROBOT_TAG_HEIGHT = 20
export const ROBOT_TAG_GAP = 6

const DOCK_BAY_KINDS = new Set<EndpointVisualKind>([
  'SHELF',
  'CHARGER',
  'PARK',
  'INBOUND',
  'OUTBOUND',
  'INSPECTION',
])

const MAX_WALL_DISTANCE_METERS = 0.8
const MAX_ROOM_SPAN_FOR_ARCH_METERS = 30
const SHELF_EXTERIOR_MARGIN = SHELF_BAY_DEPTH_METERS + 0.1
const WALL_BREATH_MARGIN = 0.1

export type EndpointVisualKind =
  | 'WAYPOINT'
  | 'SHELF'
  | 'INBOUND'
  | 'OUTBOUND'
  | 'CHARGER'
  | 'PARK'
  | 'INSPECTION'
  | 'WAIT'

export type PerimeterWall = 'top' | 'bottom' | 'left' | 'right'

export interface OttoPerimeterWalls {
  top: boolean
  bottom: boolean
  left: boolean
  right: boolean
}

export interface OttoDockBayGeometry {
  id: string
  kind: EndpointVisualKind
  endpointType: string
  x: number
  y: number
  width: number
  length: number
  headingDeg: number
}

export interface OttoShelfBayGeometry {
  id: string
  code: string
  name: string
  wall: PerimeterWall
  minX: number
  minY: number
  maxX: number
  maxY: number
  slots: 2 | 3
  opening: { x1: number; y1: number; x2: number; y2: number }
  connector: { x1: number; y1: number; x2: number; y2: number } | null
}

export interface OttoStationArchitecture {
  dockBays: OttoDockBayGeometry[]
  shelfBays: OttoShelfBayGeometry[]
  expandedBounds: MapBounds
  perimeterWalls: OttoPerimeterWalls
}

export type RobotTagPlacement = 'below' | 'above' | 'right' | 'left' | 'below-far' | 'above-far'

export interface OttoRobotTagInput {
  id: string
  code: string
  x: number
  y: number
  isSelected?: boolean
}

export interface ResolvedOttoRobotTagLayout {
  placement: RobotTagPlacement
  tagWidth: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Classify endpoint operational role from DB type, storage linkage, code, and display name. */
export function endpointVisualKind(
  endpoint: Pick<Endpoint, 'endpointType' | 'code' | 'name' | 'storageLocation'>,
): EndpointVisualKind {
  const hint = `${endpoint.code ?? ''} ${endpoint.name ?? ''}`
  if (endpoint.endpointType === 'CHARGER' || /charg/i.test(hint)) return 'CHARGER'
  if (endpoint.endpointType === 'PARK' || /park/i.test(hint)) return 'PARK'
  if (/inbound|receiv/i.test(hint)) return 'INBOUND'
  if (/outbound|ship|dispatch|dock/i.test(hint)) return 'OUTBOUND'
  if (Boolean(endpoint.storageLocation) || /shelf|rack|bay|bin/i.test(hint)) return 'SHELF'
  if (/inspect|qc|quality|check/i.test(hint)) return 'INSPECTION'
  if (endpoint.endpointType === 'QUEUE' || /wait|queue|buffer|stag/i.test(hint)) return 'WAIT'
  return 'WAYPOINT'
}

/** Achromatic OTTO neutrals for shelves/waypoints, with semantic accents for Charger, Inbound, and Outbound. */
export function visualKindColor(kind: EndpointVisualKind): string {
  switch (kind) {
    case 'CHARGER':
    case 'INBOUND':
      return 'var(--otto-endpoint-emerald)'
    case 'OUTBOUND':
      return 'var(--otto-endpoint-amber)'
    case 'WAIT':
      return 'var(--otto-endpoint-muted)'
    case 'SHELF':
    case 'PARK':
    case 'INSPECTION':
    case 'WAYPOINT':
    default:
      return 'var(--otto-endpoint-neutral)'
  }
}

export function endpointVisualKindLabel(kind: EndpointVisualKind): string {
  switch (kind) {
    case 'SHELF':
      return t('Shelf bay')
    case 'INBOUND':
      return t('Inbound')
    case 'OUTBOUND':
      return t('Outbound')
    case 'CHARGER':
      return t('Charger')
    case 'PARK':
      return t('Park')
    case 'INSPECTION':
      return t('Inspection')
    case 'WAIT':
      return t('Queue point')
    case 'WAYPOINT':
    default:
      return t('Waypoint')
  }
}

const PERIMETER_WALLS: readonly PerimeterWall[] = ['top', 'bottom', 'left', 'right']

const PERIMETER_WALL_NORMAL: Record<PerimeterWall, { nx: number; ny: number }> = {
  top: { nx: 0, ny: 1 },
  bottom: { nx: 0, ny: -1 },
  left: { nx: -1, ny: 0 },
  right: { nx: 1, ny: 0 },
}

function selectShelfPerimeterWall(
  distances: Record<PerimeterWall, number>,
  hx: number,
  hy: number,
): PerimeterWall | null {
  let bestWall: PerimeterWall | null = null
  let bestScore = Infinity

  for (const wall of PERIMETER_WALLS) {
    const dist = distances[wall]
    if (!Number.isFinite(dist) || dist > MAX_WALL_DISTANCE_METERS) continue
    const { nx, ny } = PERIMETER_WALL_NORMAL[wall]
    const score = dist - 0.18 * (hx * nx + hy * ny)
    if (score < bestScore) {
      bestScore = score
      bestWall = wall
    }
  }

  return bestWall
}

interface ShelfCandidate {
  ep: Endpoint
  wall: PerimeterWall
  isHoriz: boolean
  anchorPos: number
  desiredSpan: number
  depth: number
  wallCoord: number
  wallMin: number
  wallMax: number
  startX: number
  startY: number
  needsConnector: boolean
}

/**
 * Derive world-scaled floor docking bays (`[ ]`), recessed wall-mounted shelf bays, and expanded
 * exterior bounds for an indoor warehouse floorplan (`<= 30m` span).
 */
export function computeOttoStationArchitecture(
  endpoints: readonly Endpoint[],
  bounds: MapBounds,
  yawUnit: 'deg' | 'rad' = 'rad',
): OttoStationArchitecture {
  const perimeterWalls: OttoPerimeterWalls = { top: false, bottom: false, left: false, right: false }
  const mapWidth = bounds.maxX - bounds.minX
  const mapHeight = bounds.maxY - bounds.minY

  if (
    !Number.isFinite(mapWidth) ||
    !Number.isFinite(mapHeight) ||
    mapWidth <= 0 ||
    mapHeight <= 0 ||
    Math.max(mapWidth, mapHeight) > MAX_ROOM_SPAN_FOR_ARCH_METERS
  ) {
    return { dockBays: [], shelfBays: [], expandedBounds: bounds, perimeterWalls }
  }

  const dockBays: OttoDockBayGeometry[] = []
  const shelfBays: OttoShelfBayGeometry[] = []
  const candidatesByWall: Record<PerimeterWall, ShelfCandidate[]> = {
    top: [],
    bottom: [],
    left: [],
    right: [],
  }

  for (const ep of endpoints) {
    if (!ep.isEnabled) continue
    const kind = endpointVisualKind(ep)
    const rad = yawUnit === 'rad' ? ep.yaw : (ep.yaw * Math.PI) / 180
    const yawDeg = (rad * 180) / Math.PI
    const headingDeg = 90 - yawDeg

    if (DOCK_BAY_KINDS.has(kind)) {
      dockBays.push({
        id: ep.id,
        kind,
        endpointType: ep.endpointType,
        x: ep.x,
        y: ep.y,
        width: DOCK_BAY_WIDTH_METERS,
        length: DOCK_BAY_LENGTH_METERS,
        headingDeg,
      })
    }

    if (kind !== 'SHELF') continue

    const wall = selectShelfPerimeterWall(
      {
        top: Math.abs(bounds.maxY - ep.y),
        bottom: Math.abs(ep.y - bounds.minY),
        left: Math.abs(ep.x - bounds.minX),
        right: Math.abs(bounds.maxX - ep.x),
      },
      Math.cos(rad),
      Math.sin(rad),
    )
    if (!wall) continue

    perimeterWalls[wall] = true
    const { nx, ny } = PERIMETER_WALL_NORMAL[wall]
    const isHoriz = wall === 'top' || wall === 'bottom'
    const wallMin = (isHoriz ? bounds.minX : bounds.minY) + 0.04
    const wallMax = (isHoriz ? bounds.maxX : bounds.maxY) - 0.04
    const desiredSpan = Math.min(SHELF_BAY_LENGTH_METERS, Math.max(0.28, wallMax - wallMin))
    const depth = SHELF_BAY_DEPTH_METERS
    const bayHalfOffset = DOCK_BAY_LENGTH_METERS * 0.5
    const startX = ep.x + nx * bayHalfOffset
    const startY = ep.y + ny * bayHalfOffset
    const wallCoord = isHoriz
      ? wall === 'top'
        ? bounds.maxY
        : bounds.minY
      : wall === 'left'
        ? bounds.minX
        : bounds.maxX
    const anchorPos = isHoriz ? ep.x : ep.y
    const needsConnector =
      wall === 'top'
        ? startY < wallCoord - 0.03
        : wall === 'bottom'
          ? startY > wallCoord + 0.03
          : wall === 'left'
            ? startX > wallCoord + 0.03
            : startX < wallCoord - 0.03

    candidatesByWall[wall].push({
      ep,
      wall,
      isHoriz,
      anchorPos,
      desiredSpan,
      depth,
      wallCoord,
      wallMin,
      wallMax,
      startX,
      startY,
      needsConnector,
    })
  }

  const gap = 0.04
  const minSpan = 0.28

  for (const wall of PERIMETER_WALLS) {
    const group = candidatesByWall[wall]
    if (group.length === 0) continue

    const sorted = [...group].sort((a, b) => a.anchorPos - b.anchorPos)
    const placed = sorted.map((c, idx) => {
      const prevDist = idx > 0 ? c.anchorPos - sorted[idx - 1].anchorPos - gap : Infinity
      const nextDist = idx < sorted.length - 1 ? sorted[idx + 1].anchorPos - c.anchorPos - gap : Infinity
      const span = Math.max(minSpan, Math.min(c.desiredSpan, prevDist, nextDist))
      const maxStart = Math.max(c.wallMin, c.wallMax - span)
      const start = clamp(c.anchorPos - span / 2, c.wallMin, maxStart)
      return { c, start, end: start + span }
    })

    for (let i = 1; i < placed.length; i++) {
      const prev = placed[i - 1]
      const curr = placed[i]
      if (prev.end + gap > curr.start) {
        const mid = (prev.end + curr.start) / 2
        prev.end = Math.max(prev.start + minSpan, mid - gap / 2)
        curr.start = Math.max(Math.min(curr.end - minSpan, mid + gap / 2), prev.end + gap)
        if (curr.end < curr.start + minSpan) {
          curr.end = Math.min(curr.c.wallMax, curr.start + minSpan)
        }
      }
    }

    for (const { c, start, end } of placed) {
      const finalSpan = Math.max(0.16, end - start)
      const slots: 2 | 3 = finalSpan < 0.44 ? 2 : 3
      if (c.isHoriz) {
        const minY = c.wall === 'top' ? c.wallCoord : c.wallCoord - c.depth
        const maxY = c.wall === 'top' ? c.wallCoord + c.depth : c.wallCoord
        const opening = { x1: start, y1: c.wallCoord, x2: end, y2: c.wallCoord }
        const connX = clamp(c.anchorPos, opening.x1, opening.x2)
        shelfBays.push({
          id: c.ep.id,
          code: c.ep.code,
          name: c.ep.name,
          wall: c.wall,
          minX: start,
          minY,
          maxX: end,
          maxY,
          slots,
          opening,
          connector: c.needsConnector ? { x1: c.startX, y1: c.startY, x2: connX, y2: c.wallCoord } : null,
        })
      } else {
        const minX = c.wall === 'left' ? c.wallCoord - c.depth : c.wallCoord
        const maxX = c.wall === 'left' ? c.wallCoord : c.wallCoord + c.depth
        const opening = { x1: c.wallCoord, y1: start, x2: c.wallCoord, y2: end }
        const connY = clamp(c.anchorPos, opening.y1, opening.y2)
        shelfBays.push({
          id: c.ep.id,
          code: c.ep.code,
          name: c.ep.name,
          wall: c.wall,
          minX,
          minY: start,
          maxX,
          maxY: end,
          slots,
          opening,
          connector: c.needsConnector ? { x1: c.startX, y1: c.startY, x2: c.wallCoord, y2: connY } : null,
        })
      }
    }
  }

  const expandedBounds: MapBounds = {
    minX: bounds.minX - (perimeterWalls.left ? SHELF_EXTERIOR_MARGIN : WALL_BREATH_MARGIN),
    maxX: bounds.maxX + (perimeterWalls.right ? SHELF_EXTERIOR_MARGIN : WALL_BREATH_MARGIN),
    minY: bounds.minY - (perimeterWalls.bottom ? SHELF_EXTERIOR_MARGIN : WALL_BREATH_MARGIN),
    maxY: bounds.maxY + (perimeterWalls.top ? SHELF_EXTERIOR_MARGIN : WALL_BREATH_MARGIN),
  }

  return { dockBays, shelfBays, expandedBounds, perimeterWalls }
}

interface ScreenBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

const ROBOT_TAG_PRIORITY: readonly RobotTagPlacement[] = [
  'below',
  'above',
  'right',
  'left',
  'below-far',
  'above-far',
]

export function estimateRobotTagWidth(code: string): number {
  return Math.min(ROBOT_TAG_WIDTH, Math.max(48, Math.ceil(26 + code.length * 6.5)))
}

function boxOverlapArea(a: ScreenBox, b: ScreenBox, pad: number): number {
  const ox = Math.max(0, Math.min(a.x2 + pad, b.x2) - Math.max(a.x1 - pad, b.x1))
  if (ox <= 0) return 0
  const oy = Math.max(0, Math.min(a.y2 + pad, b.y2) - Math.max(a.y1 - pad, b.y1))
  return ox * oy
}

function candidateTagBox(
  placement: RobotTagPlacement,
  cx: number,
  cy: number,
  radius: number,
  tagW: number,
): ScreenBox {
  const offset = radius + ROBOT_TAG_GAP
  switch (placement) {
    case 'below': {
      const y1 = cy + offset
      return { x1: cx - tagW / 2, y1, x2: cx + tagW / 2, y2: y1 + ROBOT_TAG_HEIGHT }
    }
    case 'above': {
      const y2 = cy - offset
      return { x1: cx - tagW / 2, y1: y2 - ROBOT_TAG_HEIGHT, x2: cx + tagW / 2, y2 }
    }
    case 'right': {
      const x1 = cx + offset
      return { x1, y1: cy - ROBOT_TAG_HEIGHT / 2, x2: x1 + tagW, y2: cy + ROBOT_TAG_HEIGHT / 2 }
    }
    case 'left': {
      const x2 = cx - offset
      return { x1: x2 - tagW, y1: cy - ROBOT_TAG_HEIGHT / 2, x2, y2: cy + ROBOT_TAG_HEIGHT / 2 }
    }
    case 'below-far': {
      const y1 = cy + offset + ROBOT_TAG_HEIGHT + 4
      return { x1: cx - tagW / 2, y1, x2: cx + tagW / 2, y2: y1 + ROBOT_TAG_HEIGHT }
    }
    case 'above-far': {
      const y2 = cy - offset - ROBOT_TAG_HEIGHT - 4
      return { x1: cx - tagW / 2, y1: y2 - ROBOT_TAG_HEIGHT, x2: cx + tagW / 2, y2 }
    }
  }
}

/**
 * Resolve non-overlapping HTML pill placements around robot centres given screen-base coordinates
 * (`+x` right, `+y` down), chassis radius floor `halfSpanPx`, settled `zoom`, and `pxPerMetre`.
 */
export function resolveOttoRobotTagPlacements(
  items: readonly OttoRobotTagInput[],
  halfSpanPx: number,
  zoom: number,
  pxPerMetre = 1,
): Record<string, ResolvedOttoRobotTagLayout> {
  if (items.length === 0) return {}

  const z = Math.max(1, Number.isFinite(zoom) ? zoom : 1)
  const worldHalfPx =
    Number.isFinite(pxPerMetre) && pxPerMetre > 0 ? ROBOT_LENGTH_METERS * 0.5 * pxPerMetre : 0
  const baseRadius = Math.max(halfSpanPx, worldHalfPx) + 3
  const r = baseRadius * z

  const entries = items.map((item) => {
    const cx = item.x * z
    const cy = item.y * z
    return {
      item,
      cx,
      cy,
      tagWidth: estimateRobotTagWidth(item.code),
      chassis: { x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r },
    }
  })

  const sorted = [...entries].sort(
    (a, b) =>
      (a.item.isSelected ? 0 : 1) - (b.item.isSelected ? 0 : 1) ||
      a.item.code.localeCompare(b.item.code) ||
      a.item.id.localeCompare(b.item.id),
  )

  const placedTags: ScreenBox[] = []
  const result: Record<string, ResolvedOttoRobotTagLayout> = {}

  for (const current of sorted) {
    let chosenPlacement: RobotTagPlacement = 'below'
    let chosenBox = candidateTagBox('below', current.cx, current.cy, r, current.tagWidth)
    let bestScore = Infinity

    for (const placement of ROBOT_TAG_PRIORITY) {
      const box = candidateTagBox(placement, current.cx, current.cy, r, current.tagWidth)
      let score = 0

      for (const placed of placedTags) {
        score += boxOverlapArea(box, placed, 4)
      }
      for (const other of entries) {
        if (other.item.id === current.item.id) continue
        score += boxOverlapArea(box, other.chassis, 2)
      }

      if (score === 0) {
        chosenPlacement = placement
        chosenBox = box
        break
      }
      if (score < bestScore) {
        bestScore = score
        chosenPlacement = placement
        chosenBox = box
      }
    }

    placedTags.push(chosenBox)
    result[current.item.id] = { placement: chosenPlacement, tagWidth: current.tagWidth }
  }

  return result
}

const UUID_PATTERN = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

/** Turn raw coordinator strings such as `SEED_CONFLICT:HELD_BY:<uuid>` into readable operator text. */
export function formatTrafficAlertReason(
  reason: string,
  robots: ReadonlyArray<{ id: string; code: string }>,
): string {
  const trimmed = reason.trim()
  if (!trimmed) return t('Traffic quarantine active')

  const uuidMatch = trimmed.match(UUID_PATTERN)
  const holderId = uuidMatch?.[1] ?? null
  const holderCode = holderId
    ? (robots.find((r) => r.id.toLowerCase() === holderId.toLowerCase())?.code ?? holderId.slice(0, 8))
    : null

  if (/^SEED_CONFLICT\b/i.test(trimmed) || /^RECONCILE_CONFLICT\b/i.test(trimmed)) {
    return holderCode
      ? t('Zone conflict: space held by {code}', { code: holderCode })
      : t('Zone conflict at start pose')
  }
  if (/^CELL_CONFLICT\b/i.test(trimmed) || /^HELD_BY\b/i.test(trimmed)) {
    return holderCode
      ? t('Blocked by {code}', { code: holderCode })
      : t('Path cell blocked')
  }
  if (/^DEADLOCK\b/i.test(trimmed)) {
    return holderCode
      ? t('Deadlock with {code}', { code: holderCode })
      : t('Traffic deadlock detected')
  }
  if (/^OFFLINE\b/i.test(trimmed)) {
    return t('Robot offline during traffic grant')
  }
  if (/^LOCALIZATION_LOSS\b/i.test(trimmed)) {
    return t('Robot localization lost')
  }
  if (/^RECONNECT_UNVERIFIED\b/i.test(trimmed)) {
    return t('Pose unverified after reconnect')
  }
  if (/^RECONCILE_IN_MOTION\b/i.test(trimmed)) {
    return t('Robot still moving during pose reconcile')
  }
  if (/^RECONCILE_UNCERTAIN\b/i.test(trimmed)) {
    return t('Pose uncertain after traffic reconcile')
  }
  if (/^CANCEL_WHILE_OCCUPIED\b/i.test(trimmed)) {
    return t('Canceled while holding shared space')
  }
  if (/^NAVIGATE:/i.test(trimmed)) {
    return t('Navigation failure during route')
  }
  if (/^OFF_PATH\b/i.test(trimmed)) {
    return t('Robot deviated from planned lane')
  }
  if (/^STALE_TELEMETRY\b/i.test(trimmed)) {
    return t('Telemetry update delayed')
  }

  if (holderId && holderCode) {
    return trimmed.replace(holderId, holderCode).replace(/[:_]+/g, ' ')
  }
  return trimmed.includes(':') || trimmed.includes('_')
    ? trimmed.replace(/[:_]+/g, ' ').toLowerCase()
    : trimmed
}

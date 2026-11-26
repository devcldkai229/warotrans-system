import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRobotLiveCostmap, getSemanticLayers, getStaticCostmap, type TrafficSnapshot } from '@/shared/api/fleet'
import { cellCorner, COSTMAP_ALPHA, liveCostmapToDataUrl, type MapCellSet, type MapCostmapImage } from '@/shared/map/costmap'
import { PLAN_COLORS } from './useTrafficOverlay'

/** What the Fleet map shows besides robots and endpoints (endpoints always stay). */
export interface MapViewState {
  /** 'MAP' = the map's own costmap (map + inflation, as right after mapping); a robot code = that robot's live Nav2
   * costmap (adds what its LiDAR marked); null = no costmap. */
  costmapRobot: string | null
  /** With the map's costmap: also the planner keep-out mask (lethal, not inflated, as Nav2 applies filters). */
  keepout: boolean
  /** Also the robot's local costmap (rolling window, live LiDAR obstacles). */
  local: boolean
  zones: boolean
  lanes: boolean
  /** Plans, granted edges, traffic cells, quarantine alerts. */
  traffic: boolean
  /** The 35 cm floor tiles, to see where a robot stands and check it is drawn at its real size. */
  floorGrid: boolean
}

const STORAGE_KEY = 'warotrans.fleetMap.view'
const DEFAULT_VIEW: MapViewState = { costmapRobot: null, keepout: false, local: false, zones: true, lanes: true, traffic: true, floorGrid: false }

function readSaved(): MapViewState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULT_VIEW, ...(JSON.parse(raw) as Partial<MapViewState>) } : DEFAULT_VIEW
  } catch {
    return DEFAULT_VIEW
  }
}

function toImage(body: Parameters<typeof liveCostmapToDataUrl>[0] | undefined, id: string): MapCostmapImage | null {
  if (!body) return null
  const url = liveCostmapToDataUrl(body)
  return url
    ? { id, url, originX: body.originX, originY: body.originY, widthM: body.width * body.resolution,
        heightM: body.height * body.resolution, opacity: COSTMAP_ALPHA }
    : null
}

/**
 * The Fleet map's view: a robot's own live Nav2 costmap (what its planner plans on, as RViz draws it) and which traffic
 * layers stay visible, so an operator can look at endpoints + costmap alone. The choice is remembered per viewer.
 */
export function useCostmapOverlay(
  snap: TrafficSnapshot | undefined,
  robots: ReadonlyArray<{ id: string; code: string }>,
  enabled: boolean,
) {
  const [view, setView] = useState<MapViewState>(readSaved)
  const robot = robots.find((r) => r.code === view.costmapRobot) ?? null

  const staticMap = useQuery({
    queryKey: ['fleet-static-costmap', view.keepout],
    queryFn: () => getStaticCostmap(view.keepout),
    enabled: enabled && view.costmapRobot === 'MAP',
    staleTime: 10 * 60_000,
    retry: false,
  })
  const global = useQuery({
    queryKey: ['fleet-live-costmap', robot?.id, 'global'],
    queryFn: () => getRobotLiveCostmap(robot!.id, 'global'),
    enabled: enabled && robot != null,
    refetchInterval: 3000,
    retry: false,
  })
  const local = useQuery({
    queryKey: ['fleet-live-costmap', robot?.id, 'local'],
    queryFn: () => getRobotLiveCostmap(robot!.id, 'local'),
    enabled: enabled && robot != null && view.local,
    refetchInterval: 1000,
    retry: false,
  })
  // Cell size of the traffic grid, for drawing held / granted cells.
  const layers = useQuery({ queryKey: ['fleet-semantic-layers'], queryFn: getSemanticLayers, enabled: enabled && view.traffic,
    staleTime: 5 * 60_000, retry: false })

  const globalStamp = global.data?.receivedAt ?? ''
  const localStamp = local.data?.receivedAt ?? ''
  const costmapImages = useMemo<MapCostmapImage[]>(() => {
    if (view.costmapRobot === 'MAP') {
      const img = toImage(staticMap.data, `static-${view.keepout ? 'keepout' : 'map'}`)
      return img ? [img] : []
    }
    if (!robot) return []
    const g = toImage(global.data?.costmap, `live-global-${robot.code}`)
    const l = view.local ? toImage(local.data?.costmap, `live-local-${robot.code}`) : null
    return [g, l].filter((x): x is MapCostmapImage => x != null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw only when a new sample arrived
  }, [robot?.code, globalStamp, localStamp, view.local, view.costmapRobot, view.keepout, staticMap.data])

  const cellSets = useMemo<MapCellSet[]>(() => {
    if (!view.traffic || !snap) return []
    const size = layers.data?.cellSizeMeters ?? 0.1
    const codes = robots.map((r) => r.code).sort()
    return snap.robots.flatMap((r) => {
      const rb = robots.find((item) => item.id === r.robotId)
      if (!rb) return []
      const color = PLAN_COLORS[codes.indexOf(rb.code) % PLAN_COLORS.length]
      const held = new Set(r.occupiedResourceIds ?? [])
      const granted = (r.authority?.resourceIds ?? []).filter((id) => !held.has(id))
      const toCells = (ids: Iterable<string>) => [...ids].flatMap((id) => (cellCorner(id, size) ? [cellCorner(id, size)!] : []))
      return [
        { robotCode: rb.code, color, kind: 'held' as const, size, cells: toCells(held) },
        { robotCode: rb.code, color, kind: 'granted' as const, size, cells: toCells(granted) },
      ].filter((set) => set.cells.length > 0)
    })
  }, [view.traffic, snap, robots, layers.data?.cellSizeMeters])

  const update = (patch: Partial<MapViewState>) =>
    setView((prev) => {
      const next = { ...prev, ...patch }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // per-viewer convenience only
      }
      return next
    })

  return {
    view,
    update,
    costmapImages,
    cellSets,
    /** The chosen robot sends no costmap (gateway without uplink, offline, or older than 30 s). */
    noCostmap: robot != null && global.isFetched && !global.data,
    staticInfo: view.costmapRobot === 'MAP' ? staticMap.data ?? null : null,
    staticError: view.costmapRobot === 'MAP' && staticMap.isError,
    receivedAt: global.data?.receivedAt ?? null,
    robotCodes: robots.map((r) => r.code).sort(),
  }
}

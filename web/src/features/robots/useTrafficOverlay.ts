import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTrafficSnapshot, type TrafficSnapshot } from '@/shared/api/fleet'
import type { MapTrafficOverlay } from '@/shared/map/WarehouseMap'

/**
 * Plan colours, one per robot (by code order). None is blue: the lanes are blue, and a blue plan disappeared on them.
 * Also distinct from the status colours of the robot bodies.
 */
export const PLAN_COLORS = ['#a3e635', '#ff5fa2', '#ff9f43', '#c084fc', '#f7d046', '#5eead4']

/**
 * What the map draws of the traffic coordinator's snapshot: the lanes a robot holds the authority of, the zones and cells
 * held (by the plain holders and by semantic grants), and which of the robots a screen draws are quarantined. `robots`
 * maps a robot id in the snapshot to its code.
 */
export function buildTrafficOverlay(snap: TrafficSnapshot, robots: ReadonlyArray<{ id: string; code: string }>): MapTrafficOverlay {
  const authorizedEdgeIds = snap.robots.flatMap((r) => r.authority?.edgeIds ?? [])
  const occupiedResourceIds = snap.resources.filter((r) => r.holders.length > 0).map((r) => r.resourceId)
  // Stage-3: also surface zone:/cell: ids held via semantic grants.
  const semanticHeld = snap.robots.flatMap((r) => r.authority?.resourceIds ?? r.occupiedResourceIds ?? [])
  const allOccupied = Array.from(new Set([...occupiedResourceIds, ...semanticHeld]))
  const quarantined = new Set(snap.robots.filter((r) => r.phase === 'Quarantined' || r.quarantineReason).map((r) => r.robotId))
  const quarantinedRobotCodes = robots.filter((robot) => quarantined.has(robot.id)).map((robot) => robot.code)
  // One colour per robot, stable by code, so a plan reads as "that robot's" at a glance (OTTO-style swath).
  const codes = robots.map((robot) => robot.code).sort()
  const plannedPaths = snap.robots.flatMap((r) => {
    if (!r.proposedPath || r.proposedPath.length === 0) return []
    const robot = robots.find((item) => item.id === r.robotId)
    if (!robot) return []
    const start = r.x != null && r.y != null ? [{ x: r.x, y: r.y }] : []
    const pts = [...start, ...r.proposedPath.map((p) => ({ x: p.x, y: p.y }))]
    if (pts.length < 2) return []
    const granted = Math.min(r.grantedPathPoints ?? 0, r.proposedPath.length)
    const last = r.proposedPath[r.proposedPath.length - 1]
    return [
      {
        robotCode: robot.code,
        color: PLAN_COLORS[codes.indexOf(robot.code) % PLAN_COLORS.length],
        points: pts,
        // The robot's own pose counts as granted once anything ahead of it is.
        grantedCount: granted > 0 ? granted + start.length : 0,
        goalYaw: last.yaw,
        waiting: granted === 0,
      },
    ]
  })
  return {
    authorizedEdgeIds,
    occupiedResourceIds: allOccupied,
    quarantinedRobotCodes,
    ...(plannedPaths.length > 0 ? { plannedPaths } : {}),
  }
}

/** What one robot's traffic wait comes down to, for the map callout. */
export interface TrafficWaitSummary {
  /** The resource to name: one another robot really holds (a zone before a cell), else the first waited on. */
  resourceId: string
  reason: string
  /** Code of the robot holding it (or queued before this one); null when unknown. */
  blockerCode: string | null
  /** How many other resources this robot also waits on. */
  more: number
}

/**
 * Picks, out of every resource a robot waits on, the one that explains the wait. Most of a semantic wait list is
 * free cells queued behind the one zone or cell another robot holds; naming the first id alphabetically hid that.
 */
export function summarizeTrafficWait(
  robotId: string,
  snap: TrafficSnapshot,
  robots: ReadonlyArray<{ id: string; code: string }>,
): TrafficWaitSummary | null {
  const waits = snap.waits.filter((w) => w.robotId === robotId)
  if (waits.length === 0) return null
  const holders = new Map(snap.resources.map((r) => [r.resourceId, r.holders.filter((h) => h !== robotId)]))
  const heldByOther = waits.filter((w) => (holders.get(w.resourceId)?.length ?? 0) > 0)
  const rank = (id: string) => (id.startsWith('zone:') ? 0 : id.startsWith('bay:') ? 1 : 2)
  const pick =
    [...heldByOther].sort((a, b) => rank(a.resourceId) - rank(b.resourceId) || a.resourceId.localeCompare(b.resourceId))[0] ??
    waits[0]
  const blockerId = holders.get(pick.resourceId)?.[0] ?? pick.blockingOwner ?? null
  const blockerCode = blockerId ? (robots.find((r) => r.id === blockerId)?.code ?? null) : null
  return { resourceId: pick.resourceId, reason: pick.reason, blockerCode, more: waits.length - 1 }
}

/**
 * The live traffic layer of the shared map. It polls the snapshot, so a screen that shows a map and does not need it live
 * (a finished Job, a user without traffic.read) passes `enabled: false` and keeps only the static lanes and zones. Every
 * screen that asks shares one query.
 */
export function useTrafficOverlay(robots: ReadonlyArray<{ id: string; code: string }>, enabled = true) {
  const query = useQuery({
    queryKey: ['fleet-traffic-snapshot'],
    queryFn: getTrafficSnapshot,
    refetchInterval: 2000,
    enabled,
    retry: false,
  })
  const snap = enabled ? (query.data as TrafficSnapshot | undefined) : undefined
  const overlay = useMemo<MapTrafficOverlay | null>(() => (snap ? buildTrafficOverlay(snap, robots) : null), [snap, robots])

  return { snap, overlay }
}

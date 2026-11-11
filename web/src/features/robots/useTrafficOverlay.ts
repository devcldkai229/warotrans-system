import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTrafficSnapshot, type TrafficSnapshot } from '@/shared/api/fleet'
import type { MapTrafficOverlay } from '@/shared/map/WarehouseMap'

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
  return { authorizedEdgeIds, occupiedResourceIds: allOccupied, quarantinedRobotCodes }
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

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMapVersionCostmap } from '@/shared/api/navigation'
import { blocksEndpoint, costAtPoint, liveCostmapToDataUrl } from '@/shared/map/costmap'

/**
 * The map version's own costmap in the editor: the image to draw (only walls + the inscribed band) and a test for
 * whether an endpoint may stand at a point (the server refuses the same places: endpoint_in_costmap_blocked).
 */
export function useMapCostmap(mapVersionId: string | undefined) {
  const query = useQuery({
    queryKey: ['map-version-costmap', mapVersionId],
    queryFn: () => getMapVersionCostmap(mapVersionId!),
    enabled: Boolean(mapVersionId),
    staleTime: 10 * 60_000,
    retry: false,
  })
  const body = query.data ?? null
  const bytes = useMemo(() => (body ? Uint8Array.from(atob(body.data), (c) => c.charCodeAt(0)) : null), [body])
  const url = useMemo(() => (body ? liveCostmapToDataUrl(body) : null), [body])

  /** Null when the endpoint may stand there (or the map has no occupancy image); otherwise why not. */
  const endpointBlockedAt = (x: number, y: number): 'wall' | 'inscribed' | null => {
    if (!body || !bytes) return null
    const cost = costAtPoint(body, bytes, x, y)
    if (!blocksEndpoint(cost)) return null
    return cost === 100 ? 'wall' : 'inscribed'
  }

  return { url, available: body != null, inscribedRadius: body?.inscribedRadius ?? null, endpointBlockedAt }
}

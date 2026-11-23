import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { getRobotLiveCostmap, getSemanticLayers, type TrafficSnapshot } from '@/shared/api/fleet'
import { cellCorner, liveCostmapToDataUrl, maskToDataUrl, type MapCellSet, type MapCostmapImage, type MaskStyle } from '@/shared/map/costmap'
import { PLAN_COLORS } from './useTrafficOverlay'

export type CostmapLayerKey = 'keepout' | 'speed' | 'cells' | 'liveGlobal' | 'liveLocal'

const STORAGE_KEY = 'warotrans.fleetMap.costmap'

function readSaved(): Record<CostmapLayerKey, boolean> {
  const fallback = { keepout: false, speed: false, cells: false, liveGlobal: false, liveLocal: false }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<Record<CostmapLayerKey, boolean>>) } : fallback
  } catch {
    return fallback
  }
}

/**
 * Admin map costmap: the bundle's keep-out and speed masks (what Nav2 plans with on every robot) and the traffic
 * cells each robot holds (solid) or was granted ahead of it (outline). Off by default; the choice is remembered.
 */
export function useCostmapOverlay(
  snap: TrafficSnapshot | undefined,
  robots: ReadonlyArray<{ id: string; code: string }>,
  enabled: boolean,
) {
  const [shown, setShown] = useState<Record<CostmapLayerKey, boolean>>(readSaved)
  const anyMask = shown.keepout || shown.speed
  const query = useQuery({
    queryKey: ['fleet-semantic-layers'],
    queryFn: getSemanticLayers,
    enabled: enabled && (anyMask || shown.cells),
    staleTime: 5 * 60_000,
    retry: false,
  })
  const layers = query.data

  const images = useMemo<Record<string, MapCostmapImage | null>>(() => {
    const out: Record<string, MapCostmapImage | null> = {}
    for (const layer of layers?.layers ?? []) {
      const style: MaskStyle | null = layer.id === 'speed' ? 'speed' : layer.id === 'keepout' ? 'keepout' : null
      if (!style) continue
      const url = maskToDataUrl(layer, style)
      out[layer.id] = url
        ? {
            id: layer.id,
            url,
            originX: layer.originX,
            originY: layer.originY,
            widthM: layer.width * layer.resolution,
            heightM: layer.height * layer.resolution,
          }
        : null
    }
    return out
  }, [layers])

  // The robots' own live Nav2 costmaps (sent by each gateway): global every ~3 s, local every ~1 s.
  const liveKinds = [...(shown.liveGlobal ? (['global'] as const) : []), ...(shown.liveLocal ? (['local'] as const) : [])]
  const live = useQueries({
    queries: liveKinds.flatMap((kind) =>
      robots.map((robot) => ({
        queryKey: ['fleet-live-costmap', robot.id, kind],
        queryFn: () => getRobotLiveCostmap(robot.id, kind),
        refetchInterval: kind === 'global' ? 3000 : 1000,
        enabled,
        retry: false,
      })),
    ),
  })
  const liveStamp = live.map((q) => q.data?.receivedAt ?? '').join('|')
  const liveImages = useMemo<MapCostmapImage[]>(
    () =>
      live.flatMap((q) => {
        const body = q.data?.costmap
        if (!body) return []
        const url = liveCostmapToDataUrl(body)
        if (!url) return []
        return [
          {
            id: `live-${body.kind}-${body.robotCode}`,
            url,
            originX: body.originX,
            originY: body.originY,
            widthM: body.width * body.resolution,
            heightM: body.height * body.resolution,
            opacity: 0.85,
          },
        ]
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-render only when a new sample arrived
    [liveStamp],
  )
  const liveCount = live.filter((q) => q.data?.costmap).length

  const costmapImages = useMemo(
    () => [
      ...liveImages.filter((img) => img.id.startsWith('live-global')),
      ...(['keepout', 'speed'] as const).filter((k) => shown[k]).flatMap((k) => (images[k] ? [images[k]!] : [])),
      ...liveImages.filter((img) => img.id.startsWith('live-local')),
    ],
    [images, shown, liveImages],
  )

  const cellSets = useMemo<MapCellSet[]>(() => {
    if (!shown.cells || !snap) return []
    const size = layers?.cellSizeMeters ?? 0.1
    const codes = robots.map((r) => r.code).sort()
    return snap.robots.flatMap((r) => {
      const robot = robots.find((item) => item.id === r.robotId)
      if (!robot) return []
      const color = PLAN_COLORS[codes.indexOf(robot.code) % PLAN_COLORS.length]
      const held = new Set(r.occupiedResourceIds ?? [])
      const granted = (r.authority?.resourceIds ?? []).filter((id) => !held.has(id))
      const toCells = (ids: Iterable<string>) => [...ids].flatMap((id) => (cellCorner(id, size) ? [cellCorner(id, size)!] : []))
      return [
        { robotCode: robot.code, color, kind: 'held' as const, size, cells: toCells(held) },
        { robotCode: robot.code, color, kind: 'granted' as const, size, cells: toCells(granted) },
      ].filter((set) => set.cells.length > 0)
    })
  }, [shown.cells, snap, robots, layers?.cellSizeMeters])

  const toggle = (key: CostmapLayerKey) =>
    setShown((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // per-viewer convenience only
      }
      return next
    })

  return {
    shown,
    toggle,
    costmapImages,
    cellSets,
    available: { keepout: Boolean(images.keepout), speed: Boolean(images.speed) },
    liveCount,
    error: query.isError,
    fingerprint: layers?.fingerprint ?? null,
  }
}

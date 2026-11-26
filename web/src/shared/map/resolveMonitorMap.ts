import type { MapVersionDto } from '@/shared/api/navigation'

export interface ResolveMonitorMapInput {
  maps: Pick<MapVersionDto, 'id' | 'status'>[] | undefined
  /** Picked on this page (map picker): always wins. */
  manualId: string | null
  /** The selected robot's / request's map. */
  preferredId: string | null
  /** The last pick, remembered in the browser. */
  storedId: string | null
  /** The warehouse's PUBLISHED map. */
  activeId: string | null
}

/**
 * Which map version a monitor page shows. A remembered pick of a map that has since been ARCHIVED is dropped, so a newly
 * published map shows up by itself (2026-11-25: Fleet stayed on an archived V019 after V024 was published).
 */
export function resolveMonitorMapId({ maps, manualId, preferredId, storedId, activeId }: ResolveMonitorMapInput): string {
  if (!maps?.length) return ''
  const find = (id: string | null) => (id ? maps.find((m) => m.id === id) : undefined)
  if (find(manualId)) return manualId!
  if (find(preferredId)) return preferredId!
  const stored = find(storedId)
  if (stored && stored.status !== 'ARCHIVED') return stored.id
  if (find(activeId)) return activeId!
  return (maps.find((m) => m.status === 'PUBLISHED') ?? maps[0]).id
}

/** Maps offered by the map picker: every PUBLISHED one, plus the one shown when it is not published. */
export function pickableMaps<T extends Pick<MapVersionDto, 'id' | 'status' | 'versionNo'>>(maps: T[], shownId: string | null): T[] {
  return maps
    .filter((m) => m.status === 'PUBLISHED' || m.id === shownId)
    .sort((a, b) => b.versionNo - a.versionNo)
}

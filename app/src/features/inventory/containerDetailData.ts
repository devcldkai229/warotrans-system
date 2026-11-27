import type { ContainerListItem, StorageLocationListItem } from '../../shared/api/warehouseApi';
import { t } from '../../shared/i18n';
import type { PlaceArea, PlaceDirectory } from '../../shared/places/placeDirectory';

export interface FormattedContainerLocation {
  primary: string;
  shelfCode: string | null;
  levelNo: number | null;
  areas: PlaceArea[];
  isOnShelf: boolean;
}

/** Formats a container's current shelf/endpoint location and resolves map areas from the place directory. */
export function formatContainerLocation(
  container: Pick<
    ContainerListItem,
    'status' | 'currentStorageLocationCode' | 'currentStorageLocationName' | 'currentEndpointId' | 'currentEndpointCode' | 'currentLevelNo'
  >,
  places: Pick<PlaceDirectory, 'locations' | 'name' | 'areasOf'>,
): FormattedContainerLocation {
  const shelfCode = container.currentStorageLocationCode ?? null;
  const matchingLocation = shelfCode
    ? places.locations.find(location => location.code === shelfCode)
    : undefined;
  const endpointKey = container.currentEndpointId || matchingLocation?.endpointId || null;
  const areas = endpointKey ? places.areasOf(endpointKey) : [];

  if (shelfCode) {
    const shelfName = matchingLocation?.name ?? container.currentStorageLocationName ?? shelfCode;
    const primary = container.currentLevelNo != null
      ? `${shelfName} · ${t('Level {level}', { level: container.currentLevelNo })}`
      : shelfName;
    return {
      primary,
      shelfCode,
      levelNo: container.currentLevelNo ?? null,
      areas,
      isOnShelf: true,
    };
  }

  if (container.currentEndpointId) {
    return {
      primary: places.name(container.currentEndpointId, container.currentEndpointCode || t('At Station')),
      shelfCode: null,
      levelNo: null,
      areas,
      isOnShelf: false,
    };
  }

  return {
    primary: container.status === 'ISSUED' ? t('Issued') : t('Not on a shelf'),
    shelfCode: null,
    levelNo: null,
    areas,
    isOnShelf: false,
  };
}

/** True when the container sits on a shelf, is not already moving, and the user can create transport requests. */
export function canMoveContainer(
  container: Pick<ContainerListItem, 'status' | 'currentStorageLocationId' | 'inActiveTransport'>,
  canCreateTransport = true,
): boolean {
  return canCreateTransport
    && container.status === 'STORED'
    && !!container.currentStorageLocationId
    && !container.inActiveTransport;
}

/** True when a lost/held container without an active transport can be recovered onto a shelf. */
export function canRecoverContainer(
  container: Pick<ContainerListItem, 'status' | 'inActiveTransport'>,
  canRecoverPermission: boolean,
): boolean {
  return canRecoverPermission
    && (container.status === 'IN_TRANSIT' || container.status === 'HOLD')
    && !container.inActiveTransport;
}

/** Compares a scanned shelf/endpoint code against the container's recorded storage location code. */
export function matchesRecordedShelf(
  recordedLocationCode: string | null | undefined,
  scannedCode: string,
  locations: Pick<StorageLocationListItem, 'code' | 'endpointCode'>[],
): { scannedLabel: string; ok: boolean } {
  const trimmed = scannedCode.trim();
  const upperScanned = trimmed.toUpperCase();
  const recorded = recordedLocationCode?.trim().toUpperCase() ?? '';
  const location = locations.find(
    item => item.code.toUpperCase() === upperScanned || item.endpointCode.toUpperCase() === upperScanned,
  );
  const ok = !!recorded && (upperScanned === recorded || location?.code.toUpperCase() === recorded);
  return {
    scannedLabel: location?.code ?? trimmed,
    ok,
  };
}

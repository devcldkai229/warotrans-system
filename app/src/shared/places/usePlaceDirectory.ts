import { useQuery } from '@tanstack/react-query';
import { getMapVersionDetail, getOperatingContext, listStorageLocations } from '../api';
import { buildPlaceDirectory, EMPTY_PLACE_DIRECTORY, type PlaceDirectory } from './placeDirectory';

async function loadDirectory(): Promise<PlaceDirectory> {
  const operating = await getOperatingContext();
  const [map, locations] = await Promise.all([
    getMapVersionDetail(operating.map.id),
    listStorageLocations({ warehouseId: operating.warehouse.id, activeOnly: true }),
  ]);
  return buildPlaceDirectory(map.endpoints, locations.items, map.zones ?? []);
}

/** Names and areas of the operating map's places (cached for five minutes; empty until loaded). */
export function usePlaceDirectory(): PlaceDirectory {
  const query = useQuery({ queryKey: ['place-directory'], queryFn: loadDirectory, staleTime: 5 * 60_000, retry: 1 });
  return query.data ?? EMPTY_PLACE_DIRECTORY;
}

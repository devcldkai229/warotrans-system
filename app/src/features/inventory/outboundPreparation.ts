import { ApiError } from '../../shared/api/client';
import { getActiveMapVersion, getMapVersionDetail, type MapVersionDetailDto } from '../../shared/api/navigationApi';
import { listContainers, type ContainerListItem } from '../../shared/api/warehouseApi';
import type { PreparedContainer } from './voucherPreparation';

export function staleOutboundSelections(selected: PreparedContainer[], candidates: ContainerListItem[]) {
  return selected.filter(item => !candidates.some(candidate => candidate.id === item.id && candidate.barcode === item.barcode
    && candidate.currentEndpointId === item.endpointId && candidate.productName === item.productName && candidate.productSku === item.productSku));
}

/** Preview convention matches transport's point-code hints. It is NOT canonical voucher eligibility. */
export function outboundPreviewItems(map: MapVersionDetailDto, warehouseId: string, containers: ContainerListItem[]) {
  if (map.warehouseId !== warehouseId) throw new ApiError(502, 'warehouse_mismatch', 'The map belongs to another warehouse.');
  const points = map.endpoints.filter(point => point.mapVersionId === map.id && point.isEnabled && point.endpointType === 'WAYPOINT'
    && /(^|[-_ ])OUTBOUND($|[-_ ])/i.test(point.code));
  const ids = new Set(points.map(point => point.id));
  const seen = new Set<string>();
  const items = containers.filter(item => {
    if (!item.id || !item.barcode?.trim() || seen.has(item.id)) return false;
    seen.add(item.id);
    return item.status === 'STORED' && item.inActiveTransport === false && !!item.currentStorageLocationId
      && !!item.currentEndpointId && ids.has(item.currentEndpointId);
  });
  return { points, items };
}
export async function loadOutboundPreview(warehouseId: string, signal?: AbortSignal) {
  const active = await getActiveMapVersion(warehouseId, signal);
  if (!active) throw new ApiError(409, 'map_unavailable', 'No active map is available for checking Outbound locations.');
  if (active.warehouseId !== warehouseId) throw new ApiError(502, 'warehouse_mismatch', 'The map belongs to another warehouse.');
  const map = await getMapVersionDetail(active.id, signal);
  if (map.id !== active.id) throw new ApiError(502, 'map_mismatch', 'The active map could not be verified.');
  const containers: ContainerListItem[] = [];
  let skip = 0;
  while (true) {
    const page = await listContainers({ warehouseId, skip, take: 200 }, signal);
    if (!Array.isArray(page.items) || !Number.isInteger(page.total) || page.total < 0) throw new ApiError(502, 'invalid_container_page', 'Container data could not be verified.');
    containers.push(...page.items); skip += page.items.length;
    if (skip >= page.total) break;
    if (!page.items.length || skip >= 10000) throw new ApiError(409, 'incomplete_container_list', 'The container list is incomplete. Refresh before selecting.');
  }
  const preview = outboundPreviewItems(map, warehouseId, containers);
  if (!preview.points.length) throw new ApiError(409, 'outbound_unavailable', 'No enabled Outbound point is configured on this map.');
  return preview;
}

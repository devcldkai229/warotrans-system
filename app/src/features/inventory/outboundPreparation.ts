import { ApiError } from '../../shared/api/client';
import { listContainers, type ContainerListItem } from '../../shared/api/warehouseApi';
import type { PreparedContainer } from './voucherPreparation';

export function staleOutboundSelections(selected: PreparedContainer[], candidates: ContainerListItem[]) {
  return selected.filter(item => !candidates.some(candidate => candidate.id === item.id && candidate.barcode === item.barcode
    && candidate.currentEndpointId === item.endpointId && candidate.productName === item.productName && candidate.productSku === item.productSku));
}

/** Already claimed by a live phiếu xuất (draft or confirmed): it cannot go on another one. */
function onLiveOutboundVoucher(item: ContainerListItem) {
  return item.voucher?.type === 'OUTBOUND' && (item.voucher.status === 'DRAFT' || item.voucher.status === 'CONFIRMED');
}

/**
 * Containers a phiếu xuất may name: STORED on a shelf (stock is counted there and comes off when a robot delivers the
 * Container to an Outbound gate), not moving on a Transport Request, not claimed by another live phiếu xuất.
 */
export function outboundPreviewItems(containers: ContainerListItem[]) {
  const seen = new Set<string>();
  const items = containers.flatMap(item => {
    if (!item.id || !item.barcode?.trim() || seen.has(item.id)) return [];
    seen.add(item.id);
    if (item.status !== 'STORED' || item.inActiveTransport !== false || !item.currentStorageLocationId || !item.currentEndpointId
      || onLiveOutboundVoucher(item)) return [];
    return [item];
  });
  return { items };
}

export async function loadOutboundPreview(warehouseId: string, signal?: AbortSignal) {
  const containers: ContainerListItem[] = [];
  let skip = 0;
  while (true) {
    const page = await listContainers({ warehouseId, eligibleOnly: false, status: 'STORED', skip, take: 200 }, signal);
    if (!Array.isArray(page.items) || !Number.isInteger(page.total) || page.total < 0) throw new ApiError(502, 'invalid_container_page', 'Container data could not be verified.');
    containers.push(...page.items); skip += page.items.length;
    if (skip >= page.total) break;
    if (!page.items.length || skip >= 10000) throw new ApiError(409, 'incomplete_container_list', 'The container list is incomplete. Refresh before selecting.');
  }
  return outboundPreviewItems(containers);
}

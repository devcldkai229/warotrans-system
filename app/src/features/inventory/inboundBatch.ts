import type { CreateContainerBatchBody, CreateContainerBatchGroupInput, ProductItem } from '../../shared/api/warehouseApi';
import { contentsQuantity, preparationCount } from './voucherPreparation';

/** Local planning groups; keys are never Container IDs or barcodes. */
export interface InboundBatchGroup {
  key: string;
  product: ProductItem | null;
  containerCount: string;
  quantity: string;
  unit: string;
}
/**
 * Staff do not manage the contents of a container (how many pieces, in what unit): a container is the unit they move.
 * The API still stores contents, so every container is recorded as holding one container's worth.
 */
export const DEFAULT_QUANTITY = '1';
export const DEFAULT_UNIT = 'container';

/** The batch total is the sum of the product rows; there is no separate total to keep in step. */
export function batchTotal(groups: InboundBatchGroup[]): string {
  const sum = groups.reduce((total, group) => total + (preparationCount(group.containerCount) || 0), 0);
  return sum > 0 ? String(sum) : '';
}
export interface BatchProblem { message: string; groupKey?: string }
export function newBatchGroup(groups: InboundBatchGroup[], count = ''): InboundBatchGroup {
  let index = 1;
  while (groups.some(group => group.key === `group-${index}`)) index++;
  return { key: `group-${index}`, product: null, containerCount: count, quantity: DEFAULT_QUANTITY, unit: DEFAULT_UNIT };
}
export function batchCounts(requested: string, groups: InboundBatchGroup[]) {
  const total = preparationCount(requested);
  const grouped = groups.reduce((sum, group) => sum + (preparationCount(group.containerCount) || 0), 0);
  const assigned = groups.reduce((sum, group) => sum + (group.product?.isActive ? preparationCount(group.containerCount) || 0 : 0), 0);
  return { total, grouped, assigned, remaining: total === null ? null : total - grouped };
}
export function applyBatchGroupProduct(groups: InboundBatchGroup[], groupKey: string, product: ProductItem | null): InboundBatchGroup[] {
  return groups.map(group => group.key === groupKey ? { ...group, product } : group);
}
export function inboundBatchProblem(requested: string, groups: InboundBatchGroup[]): BatchProblem | null {
  const { total, grouped } = batchCounts(requested, groups);
  if (total === null || total > 9999) return { message: 'Enter between 1 and 9,999 containers.' };
  if (!groups.length) return { message: 'Add a product to this batch.' };
  const keys = new Set<string>();
  for (const group of groups) {
    if (!group.key || keys.has(group.key)) return { message: 'Product groups could not be verified.' };
    keys.add(group.key);
    const count = preparationCount(group.containerCount);
    if (count === null || count > 9999) return { groupKey: group.key, message: 'Enter a positive whole number of containers for this product.' };
    if (!group.product?.isActive) return { groupKey: group.key, message: 'Choose an active product.' };
  }
  if (grouped !== total) return { message: 'Product group counts must equal the batch container count.' };
  return null;
}

export function createBatchRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildContainerBatchBody(
  warehouseId: string,
  requestId: string,
  requestedCount: string,
  groups: InboundBatchGroup[],
  stockVoucherId?: string | null,
): CreateContainerBatchBody {
  const cleanWarehouseId = warehouseId.trim();
  const cleanRequestId = requestId.trim();
  if (!cleanWarehouseId) throw new Error('WarehouseId is required for batch receiving.');
  if (!cleanRequestId) throw new Error('RequestId is required for batch receiving.');
  const problem = inboundBatchProblem(requestedCount, groups);
  if (problem) throw new Error(problem.message);

  const containerCount = preparationCount(requestedCount)!;
  const mappedGroups: CreateContainerBatchGroupInput[] = groups.map(group => {
    const supplierBarcode = group.product?.supplierBarcode?.trim();
    return {
      groupKey: group.key.trim(),
      productId: group.product!.id,
      containerCount: preparationCount(group.containerCount)!,
      quantityPerContainer: contentsQuantity(group.quantity) ?? Number(DEFAULT_QUANTITY),
      unit: group.unit?.trim() || DEFAULT_UNIT,
      ...(supplierBarcode ? { supplierPackageBarcode: supplierBarcode } : {}),
    };
  });

  return {
    warehouseId: cleanWarehouseId,
    requestId: cleanRequestId,
    ...(stockVoucherId?.trim() ? { stockVoucherId: stockVoucherId.trim() } : {}),
    containerCount,
    groups: mappedGroups,
  };
}

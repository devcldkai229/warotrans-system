import type { InboundBatchGroup } from './inboundBatch';
import type { ProductItem } from '../../shared/api/warehouseApi';
import type { StockVoucherType } from '../../shared/types/contracts';

export interface PreparedContent { product: ProductItem | null; quantity: string; unit: string }
export interface PreparedContainer { id: string; barcode: string; productName: string; productSku: string; endpointId: string }
/** Device preparation only. None of these fields asserts server allocation, stock posting or synchronization. */
export interface VoucherPreparation {
  version: 1; type: StockVoucherType; requestedCount: string; referenceNo: string; note: string;
  groups?: InboundBatchGroup[];
  contents: Record<string, PreparedContent>; selected: Record<string, PreparedContainer>;
}
export function emptyPreparation(type: StockVoucherType): VoucherPreparation {
  return { version: 1, type, requestedCount: '', referenceNo: '', note: '', contents: {}, selected: {} };
}
export function validPreparation(value: unknown, type: StockVoucherType): value is VoucherPreparation {
  const item = value as VoucherPreparation | null;
  const record = (value: unknown) => !!value && typeof value === 'object' && !Array.isArray(value);
  return !!item && item.version === 1 && item.type === type
    && [item.requestedCount, item.referenceNo, item.note].every(value => typeof value === 'string')
    && record(item.contents) && record(item.selected)
    && (item.groups === undefined || (Array.isArray(item.groups) && new Set(item.groups.map(group => group?.key)).size === item.groups.length
      && item.groups.every(group => group && typeof group.key === 'string' && !!group.key
        && [group.containerCount, group.quantity, group.unit].every(value => typeof value === 'string')
        && (group.product === null || (group.product && typeof group.product.id === 'string' && typeof group.product.name === 'string'
          && typeof group.product.sku === 'string' && typeof group.product.isActive === 'boolean')))))
    && Object.values(item.contents).every(value => value && typeof value.quantity === 'string' && typeof value.unit === 'string'
      && (value.product === null || (value.product && typeof value.product.id === 'string' && typeof value.product.name === 'string'
        && typeof value.product.sku === 'string' && typeof value.product.isActive === 'boolean')))
    && Object.values(item.selected).every(value => value && [value.id, value.barcode, value.productName, value.productSku, value.endpointId].every(field => typeof field === 'string'));
}
export function preparationCount(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value.trim())) return null;
  const count = Number(value.trim());
  return Number.isSafeInteger(count) ? count : null;
}
export function contentsQuantity(value: string): number | null {
  if (!/^\d+(?:[.,]\d+)?$/.test(value.trim())) return null;
  const quantity = Number(value.trim().replace(',', '.'));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}
export function contentProblem(value?: PreparedContent) {
  if (!value?.product?.isActive) return 'Choose an active product.';
  if (contentsQuantity(value.quantity) === null) return 'Enter a quantity greater than zero.';
  if (!value.unit.trim()) return 'Enter a unit.';
  return null;
}
export function inboundPreparationProblem(ids: string[], prep: VoucherPreparation) {
  if (!ids.length) return 'Generate container barcodes first.';
  const expected = preparationCount(prep.requestedCount);
  if (expected === null || expected !== ids.length) return 'The allocated codes must match the requested container count.';
  for (const id of ids) { const problem = contentProblem(prep.contents[id]); if (problem) return problem; }
  return null;
}

/** Progress is local contents completeness, never server posting or stock readiness. */
export function inboundContentsProgress(ids: string[], prep: VoucherPreparation) {
  const incomplete = ids.filter(id => !!contentProblem(prep.contents[id]));
  return { complete: ids.length - incomplete.length, total: ids.length, firstIncomplete: incomplete[0] || null };
}
export function nextIncompleteContainer(ids: string[], currentId: string, prep: VoucherPreparation) {
  const index = ids.indexOf(currentId);
  const ordered = index < 0 ? ids : [...ids.slice(index + 1), ...ids.slice(0, index)];
  return ordered.find(id => !!contentProblem(prep.contents[id])) || null;
}

export function stepContainerCount(value: string, direction: 1 | -1): string {
  const current = preparationCount(value) ?? 0;
  return String(Math.max(1, Math.min(9999, current + direction)));
}

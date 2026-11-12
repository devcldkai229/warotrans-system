import type { ProductItem } from '../../shared/api/warehouseApi';
import type { StockVoucherType } from '../../shared/types/contracts';

export interface PreparedContent { product: ProductItem | null; quantity: string; unit: string }
export interface PreparedContainer { id: string; barcode: string; productName: string; productSku: string; endpointId: string }
/** Device preparation only. None of these fields asserts server allocation, stock posting or synchronization. */
export interface VoucherPreparation {
  version: 1; type: StockVoucherType; requestedCount: string; referenceNo: string; note: string;
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

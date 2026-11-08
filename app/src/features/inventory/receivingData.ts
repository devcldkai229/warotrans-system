import type { ProductItem, StorageLocationListItem } from '../../shared/api/warehouseApi';
import type { MapVersionDetailDto } from '../../shared/api/navigationApi';

export function receivingCount(value: string): number | null {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const count = Number(text);
  return Number.isInteger(count) && count >= 1 && count <= 10 ? count : null;
}

/** Only a unique exact catalog match can be selected without an operator choice. */
export function productForScannedBarcode(products: ProductItem[], barcode: string): ProductItem | null {
  const code = barcode.trim().toLowerCase();
  if (!code) return null;
  const matches = products.filter(product => product.isActive &&
    [product.sku, product.supplierBarcode].some(value => value?.trim().toLowerCase() === code));
  return matches.length === 1 ? matches[0] : null;
}

/** A configured location is an actual receiving choice; an arbitrary endpoint is not. */
export function receivingLocations(locations: StorageLocationListItem[], map: MapVersionDetailDto): StorageLocationListItem[] {
  return locations.filter(location => location.isActive && location.warehouseId === map.warehouseId &&
    map.endpoints.some(endpoint => endpoint.id === location.endpointId && endpoint.mapVersionId === map.id &&
      endpoint.isEnabled && endpoint.endpointType === 'WAYPOINT'));
}

/** The current API registers one Container at a time. Keep partial receipts on failure. */
export async function registerReceivingBatch(count: number, register: () => Promise<{ barcode: string }>) {
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('Enter between 1 and 10 containers.');
  const barcodes: string[] = [];
  let error: unknown = null;
  for (let index = 0; index < count; index++) {
    try { barcodes.push((await register()).barcode); }
    catch (failure) { error = failure; break; }
  }
  return { barcodes, error };
}

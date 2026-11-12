import { ApiError } from '../../shared/api/client';
import { listProducts, resolveProduct, type ProductItem } from '../../shared/api/warehouseApi';

export type ProductLookupResult =
  | { kind: 'matched'; product: ProductItem }
  | { kind: 'choose'; reason: 'multiple' | 'incomplete'; products: ProductItem[] };

function ensureActive(signal: AbortSignal) {
  if (!signal.aborted) return;
  const error = new Error('The product lookup was cancelled.');
  error.name = 'AbortError';
  throw error;
}

/** Resolve the barcode, then guard the cross-field SKU/supplier-barcode collision the API can otherwise hide. */
export async function lookupReceivingProduct(barcode: string, signal: AbortSignal): Promise<ProductLookupResult> {
  const code = barcode.trim();
  if (!code) throw new ApiError(400, 'product_code_required', 'Enter a product barcode or SKU.');
  ensureActive(signal);
  const resolved = await resolveProduct({ barcode: code }, signal);
  ensureActive(signal);
  const product = resolved.exactMatch;
  // Barcode resolution is case-sensitive on the server. Do not rewrite a scanned identifier.
  if (!product?.isActive || !product.id || ![product.sku, product.supplierBarcode].includes(code)) {
    throw new ApiError(502, 'product_lookup_invalid', 'The product could not be verified. Scan again.');
  }

  const page = await listProducts({ search: code, isActive: true, take: 100 }, signal);
  ensureActive(signal);
  if (!Number.isInteger(page.total) || page.total < page.items.length) {
    throw new ApiError(502, 'product_lookup_invalid', 'The product could not be verified. Scan again.');
  }
  const matches = page.items.filter(item => item.isActive && [item.sku, item.supplierBarcode].includes(code));
  // A partial search cannot prove uniqueness; require an explicit choice instead of guessing.
  if (page.total > page.items.length) return { kind: 'choose', reason: 'incomplete', products: matches };
  if (matches.length > 1) return { kind: 'choose', reason: 'multiple', products: matches };
  if (matches.length !== 1 || matches[0].id !== product.id) {
    throw new ApiError(409, 'product_lookup_changed', 'This product changed during lookup. Scan again.');
  }
  return { kind: 'matched', product: matches[0] };
}

import { ApiError } from '../../shared/api/client';
import { listProducts, resolveProduct, type CreateProductBody, type ProductItem } from '../../shared/api/warehouseApi';

export interface NewProductDraft {
  categoryId: string;
  sku: string;
  name: string;
  supplierBarcode: string;
  description: string;
}

export interface ProductInputProblem {
  field: keyof NewProductDraft;
  message: string;
}

export function validateNewProductInput(input: NewProductDraft): ProductInputProblem | null {
  if (!input.categoryId.trim()) return { field: 'categoryId', message: 'Choose a category.' };
  const sku = input.sku.trim();
  if (!sku) return { field: 'sku', message: 'Enter a product SKU.' };
  if (sku.length > 100) return { field: 'sku', message: 'SKU must be 100 characters or fewer.' };
  const name = input.name.trim();
  if (!name) return { field: 'name', message: 'Enter a product name.' };
  if (name.length > 200) return { field: 'name', message: 'Product name must be 200 characters or fewer.' };
  if (input.supplierBarcode.trim().length > 128) {
    return { field: 'supplierBarcode', message: 'Supplier barcode must be 128 characters or fewer.' };
  }
  if (input.description.trim().length > 500) {
    return { field: 'description', message: 'Description must be 500 characters or fewer.' };
  }
  return null;
}

export function buildCreateProductBody(input: NewProductDraft): CreateProductBody {
  const problem = validateNewProductInput(input);
  if (problem) throw new ApiError(400, 'validation_failed', problem.message);
  return {
    categoryId: input.categoryId.trim(),
    sku: input.sku.trim(),
    name: input.name.trim(),
    supplierBarcode: input.supplierBarcode.trim() || null,
    description: input.description.trim() || null,
  };
}

export function productCreationErrorField(error: unknown): 'sku' | 'supplierBarcode' | 'categoryId' | 'form' {
  if (!(error instanceof ApiError)) return 'form';
  switch (error.code) {
    case 'product_sku_taken':
      return 'sku';
    case 'product_supplier_barcode_taken':
      return 'supplierBarcode';
    case 'product_category_not_found':
      return 'categoryId';
    default:
      return 'form';
  }
}

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

import type { ProductItem } from '../../shared/api/warehouseApi';
import { contentProblem, preparationCount } from './voucherPreparation';

/** Local planning groups; keys are never Container IDs or barcodes. */
export interface InboundBatchGroup {
  key: string;
  product: ProductItem | null;
  containerCount: string;
  quantity: string;
  unit: string;
}
export interface BatchProblem { message: string; groupKey?: string }
export function newBatchGroup(groups: InboundBatchGroup[], count = ''): InboundBatchGroup {
  let index = 1;
  while (groups.some(group => group.key === `group-${index}`)) index++;
  return { key: `group-${index}`, product: null, containerCount: count, quantity: '', unit: '' };
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
    const problem = contentProblem(group);
    if (problem) return { groupKey: group.key, message: problem };
  }
  if (grouped !== total) return { message: 'Product group counts must equal the batch container count.' };
  return null;
}

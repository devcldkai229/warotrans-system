import { listWarehouses, type WarehouseListItem } from './warehouseApi';
import { getActiveMapVersion, type MapVersionDto } from './navigationApi';

export interface OperatingContext {
  warehouse: WarehouseListItem;
  map: MapVersionDto;
}

function time(value?: string | null): number {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/** Compare published maps across warehouses by publication time, not list order. */
export function latestPublishedContext(contexts: OperatingContext[]): OperatingContext | null {
  return contexts.filter(context => context.warehouse.isActive && context.map.status === 'PUBLISHED'
    && context.map.warehouseId === context.warehouse.id).sort((a, b) =>
    time(b.map.publishedAt) - time(a.map.publishedAt)
    || time(b.map.createdAt) - time(a.map.createdAt)
    || b.map.versionNo - a.map.versionNo
    || a.map.id.localeCompare(b.map.id))[0] || null;
}

export async function getOperatingContext(warehouseId?: string): Promise<OperatingContext> {
  const warehouses: WarehouseListItem[] = [];
  let skip = 0;
  while (true) {
    const page = await listWarehouses({ isActive: true, skip, take: 100 });
    warehouses.push(...page.items);
    skip += page.items.length;
    if (skip >= page.total) break;
    if (!page.items.length) throw new Error('The warehouse list could not be loaded completely. Try again.');
  }
  const candidates = warehouseId ? warehouses.filter(warehouse => warehouse.id === warehouseId) : warehouses;
  if (!candidates.length) throw new Error('No active operating warehouse is available.');
  const contexts = (await Promise.all(candidates.map(async warehouse => {
    const map = await getActiveMapVersion(warehouse.id);
    return map ? [{ warehouse, map }] : [];
  }))).flat();
  const selected = latestPublishedContext(contexts);
  if (!selected) throw new Error('No published warehouse map is available.');
  return selected;
}

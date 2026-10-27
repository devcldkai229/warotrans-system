import type { ContainerListItem, InventoryStockItem } from '../../shared/api/warehouseApi';

type ContainerLocation = Pick<ContainerListItem,
  'currentStorageLocationId' | 'currentStorageLocationCode' | 'currentEndpointId' | 'currentEndpointCode'>;

export function getContainerLocation(container: ContainerLocation): { key: string; label: string } {
  if (container.currentStorageLocationId || container.currentStorageLocationCode) {
    return {
      key: container.currentStorageLocationId ? `storage:${container.currentStorageLocationId}` : `storage-code:${container.currentStorageLocationCode}`,
      label: container.currentStorageLocationCode || container.currentStorageLocationId!,
    };
  }
  if (container.currentEndpointId || container.currentEndpointCode) {
    return {
      key: container.currentEndpointId ? `endpoint:${container.currentEndpointId}` : `endpoint-code:${container.currentEndpointCode}`,
      label: container.currentEndpointCode || container.currentEndpointId!,
    };
  }
  return { key: 'UNLOCATED', label: 'Unlocated' };
}

export function containerLocationFilters(containers: ContainerLocation[]): { key: string; label: string; count: number }[] {
  const locations = new Map<string, { key: string; label: string; count: number }>();
  for (const container of containers) {
    const location = getContainerLocation(container);
    const current = locations.get(location.key);
    if (current) current.count++;
    else locations.set(location.key, { ...location, count: 1 });
  }
  return [{ key: 'ALL', label: 'All Locations', count: containers.length }, ...locations.values()];
}

export interface InventoryProduct {
  id: string;
  name: string;
  sku: string;
  containerCount: number;
  locations: InventoryStockItem[];
}

export function groupInventoryByProduct(rows: InventoryStockItem[]): InventoryProduct[] {
  const products = new Map<string, InventoryProduct>();
  for (const row of rows) {
    const product = products.get(row.productId);
    if (product) {
      product.containerCount += row.containerCount;
      product.locations.push(row);
    } else {
      products.set(row.productId, {
        id: row.productId, name: row.productName, sku: row.productSku,
        containerCount: row.containerCount, locations: [row],
      });
    }
  }
  return [...products.values()];
}

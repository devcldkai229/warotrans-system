import type {
  TransportRequestDetailItem,
  TransportRequestListDetail,
  WarehouseStockPostingResponse,
} from '../../shared/api/transportApi';

export function transportRequestProgress(details: ReadonlyArray<{ status: string }>) {
  const completed = details.filter(detail => detail.status === 'COMPLETED').length;
  return { completed, total: details.length, percent: details.length ? completed / details.length * 100 : 0 };
}

export function transportRouteSummary(details: TransportRequestListDetail[], side: 'source' | 'destination'): string {
  const endpoints = [...new Set(details.map(detail => side === 'source'
    ? detail.sourceEndpointCode || detail.sourceEndpointId
    : detail.destinationEndpointCode || detail.destinationEndpointId).filter(Boolean))];
  if (!endpoints.length) return side === 'source' ? 'Pickup Unavailable' : 'Destination Unavailable';
  return endpoints.length > 1 ? `${endpoints[0]} (+${endpoints.length - 1} stops)` : endpoints[0];
}

export function transportDate(value?: string | null): string {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export interface WarehouseSyncEntry {
  stage: 'pickup' | 'delivery';
  posting: WarehouseStockPostingResponse;
}

export function detailWarehouseSyncEntries(
  detail: Pick<TransportRequestDetailItem, 'warehouseSync'>,
): WarehouseSyncEntry[] {
  const entries: WarehouseSyncEntry[] = [];
  if (detail.warehouseSync?.pickup) {
    entries.push({ stage: 'pickup', posting: detail.warehouseSync.pickup });
  }
  if (detail.warehouseSync?.delivery) {
    entries.push({ stage: 'delivery', posting: detail.warehouseSync.delivery });
  }
  return entries;
}

export function summarizeWarehouseSync(
  details: ReadonlyArray<Pick<TransportRequestDetailItem, 'warehouseSync'>>,
) {
  let pending = 0;
  let retrying = 0;
  let posted = 0;
  for (const detail of details) {
    for (const { posting } of detailWarehouseSyncEntries(detail)) {
      if (posting.status === 'POSTED') posted += 1;
      else if (posting.status === 'RETRYING') retrying += 1;
      else pending += 1;
    }
  }
  const total = pending + retrying + posted;
  return { pending, retrying, posted, total, needsRefresh: pending > 0 || retrying > 0 };
}

export function hasPendingWarehouseSync(
  details: ReadonlyArray<Pick<TransportRequestDetailItem, 'warehouseSync'>>,
): boolean {
  return summarizeWarehouseSync(details).needsRefresh;
}

export function warehouseSyncTone(status: string): 'warning' | 'danger' | 'success' | 'neutral' {
  switch (status) {
    case 'POSTED':
      return 'success';
    case 'RETRYING':
      return 'danger';
    case 'PENDING':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function warehouseSyncLabel(status: string): string {
  switch (status) {
    case 'POSTED':
      return 'Synced';
    case 'RETRYING':
      return 'Sync Retrying';
    case 'PENDING':
      return 'Sync Pending';
    default:
      return status;
  }
}

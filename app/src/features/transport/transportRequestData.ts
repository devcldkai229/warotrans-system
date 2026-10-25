import type { TransportRequestListDetail } from '../../shared/api/transportApi';

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

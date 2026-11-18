import type { EndpointDto } from '../api/navigationApi';

const TYPE_ORDER = ['PARKING', 'CHARGING', 'CHARGE', 'HOME', 'WAITING'];

/**
 * Where a robot can be told it stands: the enabled endpoints of this map version. Parking and charging points come
 * first (where a robot is normally switched on), then the rest by code.
 */
export function localizeEndpointOptions(endpoints: EndpointDto[], mapVersionId: string): EndpointDto[] {
  const rank = (endpoint: EndpointDto) => {
    const type = String(endpoint.endpointType || '').toUpperCase();
    const byType = TYPE_ORDER.findIndex(name => type.includes(name));
    const byCode = TYPE_ORDER.findIndex(name => endpoint.code.toUpperCase().includes(name === 'CHARGING' ? 'CHARG' : name));
    const best = [byType, byCode].filter(index => index >= 0);
    return best.length ? Math.min(...best) : TYPE_ORDER.length;
  };
  return endpoints
    .filter(endpoint => endpoint.isEnabled && endpoint.mapVersionId === mapVersionId)
    .sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code));
}

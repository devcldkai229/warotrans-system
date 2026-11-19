import { ZONE_LABEL, zoneColorOf } from './mapStyle';

/** Zone colour as on the web map (mapStyle.ts). */
export function zoneColor(type: string): string {
  return zoneColorOf(type);
}

export function zoneLabel(type: string): string {
  return ZONE_LABEL[type] ?? type.toLowerCase().replaceAll('_', ' ').replace(/\w/g, letter => letter.toUpperCase());
}

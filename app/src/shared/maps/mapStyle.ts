// Map paint shared with the web console (web/src/shared/map/mapStyle.ts): the same zone, lane, endpoint and robot
// colours so the phone and the web show the same warehouse. Keep both in step.

/** Lane network blue (both directions; the chevrons tell one-way from two-way). */
export const LANE_BLUE = '#3279f9';
export const LANE_BAND_OPACITY = 0.22;
export const LANE_CHEVRON_OPACITY = 0.8;

/** KEEP_OUT red + hatch, SPEED yellow, NO_STOP sky blue, SINGLE_OCCUPANCY purple, JUNCTION muted blue (legacy). */
export const ZONE_COLOR: Record<string, string> = {
  KEEP_OUT: '#c62828',
  SPEED: '#f9a825',
  NO_STOP: '#039be5',
  SINGLE_OCCUPANCY: '#8e24aa',
  JUNCTION: '#5c6bc0',
};

export const ZONE_FILL_OPACITY: Record<string, number> = {
  KEEP_OUT: 0.2,
  SPEED: 0.24,
  NO_STOP: 0.24,
  SINGLE_OCCUPANCY: 0.26,
  JUNCTION: 0.18,
};

export const ZONE_LABEL: Record<string, string> = {
  KEEP_OUT: 'Keep-out',
  SPEED: 'Speed zone',
  NO_STOP: 'No-stop',
  SINGLE_OCCUPANCY: 'Single-occupancy',
  JUNCTION: 'Junction',
};

export const ZONE_DESCRIPTION: Record<string, string> = {
  KEEP_OUT: 'Robots must not enter this area',
  SPEED: 'Reduced robot speed area',
  NO_STOP: 'Keep clear: robots pass through without stopping',
  SINGLE_OCCUPANCY: 'Only one robot allowed inside at a time',
  JUNCTION: 'Shared traffic intersection',
};

/** OTTO electric cyan first, matching web console plan swath palette. */
export const PLAN_COLORS = ['#00d2ff', '#ec5b9a', '#2dc7b4', '#a66cff', '#f7b928', '#45bd62'] as const;

export const JOB_HIGHLIGHT_COLOR = {
  pickup: '#10b981',
  dropoff: '#f59e0b',
} as const;

export function laneBandColor(isDark: boolean): string {
  return isDark ? '#255885' : '#4b6f96';
}

export function laneEdgeColor(isDark: boolean): string {
  return isDark ? '#527da3' : '#5b7fa6';
}

export function laneArrowColor(isDark: boolean): string {
  return isDark ? '#cbd5e1' : '#3b5878';
}

export function laneBandOpacity(isDark: boolean): number {
  return isDark ? 0.30 : 0.12;
}

export function zoneFillOpacity(type: string, isDark: boolean): number {
  switch (type) {
    case 'KEEP_OUT':
      return isDark ? 0.20 : 0.16;
    case 'SINGLE_OCCUPANCY':
      return isDark ? 0.19 : 0.14;
    case 'JUNCTION':
      return isDark ? 0.15 : 0.11;
    case 'SPEED':
    case 'NO_STOP':
      return isDark ? 0.18 : 0.12;
    default:
      return isDark ? 0.17 : 0.12;
  }
}

export function zoneStrokeColor(type: string, isDark: boolean): string {
  if (!isDark) return zoneColorOf(type);
  switch (type) {
    case 'KEEP_OUT':
      return '#e06c75';
    case 'SPEED':
      return '#d4b14b';
    case 'NO_STOP':
      return '#6ba3be';
    case 'SINGLE_OCCUPANCY':
      return '#a78bfa';
    case 'JUNCTION':
      return '#8b95b5';
    default:
      return zoneColorOf(type);
  }
}

/** WAYPOINT black, CHARGER green, PARK deep orange. */
export const ENDPOINT_COLOR: Record<string, string> = {
  WAYPOINT: '#121317',
  CHARGER: '#2e7d32',
  PARK: '#ef6c00',
};

export const ENDPOINT_NAME: Record<string, string> = {
  WAYPOINT: 'Waypoint',
  CHARGER: 'Charger',
  PARK: 'Park',
};

export const ROBOT_COLOR: Record<string, string> = {
  EXECUTING: '#2d88ff',
  AVAILABLE: '#45bd62',
  RESERVED: '#37b6ee',
  PAUSED: '#f7b928',
  CHARGING: '#2dc7b4',
  MAINTENANCE: '#a66cff',
  ERROR: '#f02849',
  OFFLINE: '#8a8f98',
};

export function zoneColorOf(type: string): string {
  return ZONE_COLOR[type] ?? ZONE_COLOR.JUNCTION;
}

/** The endpoint's map type as the web draws it (older rows used PARKING). */
export function endpointKind(type: string): 'WAYPOINT' | 'CHARGER' | 'PARK' {
  if (type === 'CHARGER') return 'CHARGER';
  if (type === 'PARK' || type === 'PARKING') return 'PARK';
  return 'WAYPOINT';
}

export function endpointColorOf(type: string, isDark = false): string {
  const kind = endpointKind(type);
  // Black waypoints would vanish on the dark floor: they turn light there, like the web's ink token.
  return kind === 'WAYPOINT' && isDark ? '#e6e8ec' : ENDPOINT_COLOR[kind];
}

/** Nav2 robot footprint dimensions (metres, aligned with backend TrafficFootprintOptions). */
export const ROBOT_LENGTH_METERS = 0.32;
export const ROBOT_WIDTH_METERS = 0.26;
export const DOCK_BAY_LENGTH_METERS = 0.40;
export const DOCK_BAY_WIDTH_METERS = 0.34;
export const SHELF_BAY_DEPTH_METERS = 0.35;
export const SHELF_BAY_LENGTH_METERS = 0.70;

export type EndpointVisualKind =
  | 'WAYPOINT'
  | 'SHELF'
  | 'INBOUND'
  | 'OUTBOUND'
  | 'CHARGER'
  | 'PARK'
  | 'INSPECTION'
  | 'WAIT';

/** Classify endpoint operational role from DB type, code, and display name. */
export function endpointVisualKind(
  type: string,
  code?: string,
  name?: string,
): EndpointVisualKind {
  const kind = endpointKind(type);
  const hint = `${code ?? ''} ${name ?? ''}`;
  if (kind === 'CHARGER' || /charg/i.test(hint)) return 'CHARGER';
  if (kind === 'PARK' || /park/i.test(hint)) return 'PARK';
  if (/inbound|receiv/i.test(hint)) return 'INBOUND';
  if (/outbound|ship|dispatch|dock/i.test(hint)) return 'OUTBOUND';
  if (/shelf|rack|bay|bin/i.test(hint)) return 'SHELF';
  if (/inspect|qc|quality|check/i.test(hint)) return 'INSPECTION';
  if (/wait|queue|buffer|stag/i.test(hint)) return 'WAIT';
  return 'WAYPOINT';
}

/** Achromatic OTTO architectural neutrals (graphite/silver across stations, emerald reserved for Charger). */
export function visualKindColor(
  visualKind: EndpointVisualKind,
  type: string,
  isDark: boolean,
): string {
  switch (visualKind) {
    case 'CHARGER':
      return isDark ? '#4ade80' : '#15803d';
    case 'SHELF':
    case 'INBOUND':
    case 'OUTBOUND':
    case 'PARK':
    case 'INSPECTION':
      return isDark ? '#d8dee9' : '#1f2937';
    case 'WAIT':
      return isDark ? '#94a3b8' : '#64748b';
    case 'WAYPOINT':
    default:
      return endpointColorOf(type, isDark);
  }
}

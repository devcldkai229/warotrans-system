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
  return isDark ? '#1a74e2' : LANE_BLUE;
}

export function laneEdgeColor(isDark: boolean): string {
  return isDark ? '#38bdf8' : LANE_BLUE;
}

export function laneArrowColor(isDark: boolean): string {
  return isDark ? '#e0f2fe' : '#1d4ed8';
}

export function laneBandOpacity(isDark: boolean): number {
  return isDark ? 0.28 : 0.13;
}

export function zoneFillOpacity(type: string, isDark: boolean): number {
  switch (type) {
    case 'KEEP_OUT':
      return isDark ? 0.22 : 0.16;
    case 'SINGLE_OCCUPANCY':
      return isDark ? 0.22 : 0.14;
    case 'JUNCTION':
      return isDark ? 0.18 : 0.11;
    case 'SPEED':
    case 'NO_STOP':
      return isDark ? 0.21 : 0.12;
    default:
      return isDark ? 0.2 : 0.12;
  }
}

export function zoneStrokeColor(type: string, isDark: boolean): string {
  if (!isDark) return zoneColorOf(type);
  switch (type) {
    case 'KEEP_OUT':
      return '#f87171';
    case 'SPEED':
      return '#fbbf24';
    case 'NO_STOP':
      return '#38bdf8';
    case 'SINGLE_OCCUPANCY':
      return '#c084fc';
    case 'JUNCTION':
      return '#818cf8';
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

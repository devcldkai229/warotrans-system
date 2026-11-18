const STATUS: Record<string, string> = {
  AVAILABLE: 'Available', EXECUTING: 'Working', RESERVED: 'Reserved', PAUSED: 'Paused', CHARGING: 'Charging',
  MAINTENANCE: 'Maintenance', ERROR: 'Error', OFFLINE: 'Offline',
};
const NAVIGATION: Record<string, string> = {
  IDLE: 'Idle', NAVIGATING: 'Moving', SUCCEEDED: 'Arrived', FAILED: 'Failed', CANCELED: 'Cancelled', CANCELLED: 'Cancelled', PAUSED: 'Paused',
};

export function robotStatusLabel(status: string | null | undefined): string {
  return status ? STATUS[status] ?? status : 'Unknown';
}

export function navigationLabel(status: string | null | undefined): string {
  return status ? NAVIGATION[status] ?? status : 'Idle';
}

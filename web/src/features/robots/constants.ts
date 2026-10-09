import type { RobotStatus } from '@/shared/api/contracts'

/** Order of the status filter chips on the Fleet panel (backend RobotStatus values only). */
export const ROBOT_STATUS_ORDER: RobotStatus[] = [
  'EXECUTING',
  'AVAILABLE',
  'RESERVED',
  'PAUSED',
  'CHARGING',
  'MAINTENANCE',
  'ERROR',
  'OFFLINE',
]

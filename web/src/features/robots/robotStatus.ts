import type { RobotStatus } from '@/shared/api/contracts'

/**
 * The status to show for a robot. The server keeps the operational status (AVAILABLE, EXECUTING …) and the connection
 * apart: a robot that stops reporting keeps its last status with `isOnline` false. Showing that status in green would
 * say "ready" about a robot nobody can reach, so a robot that is not reporting is shown as OFFLINE. MAINTENANCE and
 * ERROR stay as they are: they matter more, and a robot under repair is often switched off.
 */
export function shownRobotStatus(robot: { status: RobotStatus; isOnline: boolean }): RobotStatus {
  if (robot.isOnline || robot.status === 'MAINTENANCE' || robot.status === 'ERROR') return robot.status
  return 'OFFLINE'
}

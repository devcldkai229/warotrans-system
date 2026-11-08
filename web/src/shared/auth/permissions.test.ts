import { describe, expect, it } from 'vitest'
import type { Capabilities } from '@/shared/api/contracts'
import { canActOnRobot, hasPermission, mayUseConsole, PERMISSIONS } from './permissions'

function caps(partial: Partial<Capabilities>): Capabilities {
  return {
    accountId: 'a',
    role: 'ADMIN',
    mustChangePassword: false,
    permissions: [],
    robotScope: { allRobots: true, robotIds: [] },
    ...partial,
  }
}

describe('permissions', () => {
  it('grants nothing without capabilities', () => {
    expect(hasPermission(null, PERMISSIONS.robotRead)).toBe(false)
    expect(mayUseConsole(undefined)).toBe(false)
  })

  it('reads the server list, not the role name', () => {
    const staffLookingLikeAdmin = caps({ role: 'ADMIN', permissions: [PERMISSIONS.robotStop] })
    expect(hasPermission(staffLookingLikeAdmin, PERMISSIONS.userManage)).toBe(false)
    expect(hasPermission(staffLookingLikeAdmin, PERMISSIONS.robotStop)).toBe(true)
  })

  it('limits a technician to the robots in scope', () => {
    const technician = caps({
      role: 'TECHNICIAN',
      permissions: [PERMISSIONS.robotManualDrive, PERMISSIONS.consoleAccess],
      robotScope: { allRobots: false, robotIds: ['r1'] },
    })
    expect(canActOnRobot(technician, PERMISSIONS.robotManualDrive, 'r1')).toBe(true)
    expect(canActOnRobot(technician, PERMISSIONS.robotManualDrive, 'r2')).toBe(false)
    expect(canActOnRobot(technician, PERMISSIONS.robotPower, 'r1')).toBe(false)
    expect(mayUseConsole(technician)).toBe(true)
  })

  it('keeps staff out of the console', () => {
    expect(mayUseConsole(caps({ role: 'STAFF', permissions: [PERMISSIONS.robotStop] }))).toBe(false)
  })
})

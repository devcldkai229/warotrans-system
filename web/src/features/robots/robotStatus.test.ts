import { describe, expect, it } from 'vitest'
import { shownRobotStatus } from './robotStatus'

describe('shownRobotStatus', () => {
  it('shows the operational status while the robot reports', () => {
    expect(shownRobotStatus({ status: 'AVAILABLE', isOnline: true })).toBe('AVAILABLE')
    expect(shownRobotStatus({ status: 'EXECUTING', isOnline: true })).toBe('EXECUTING')
  })

  it('shows OFFLINE for a robot that stopped reporting, whatever it last said', () => {
    expect(shownRobotStatus({ status: 'AVAILABLE', isOnline: false })).toBe('OFFLINE')
    expect(shownRobotStatus({ status: 'EXECUTING', isOnline: false })).toBe('OFFLINE')
    expect(shownRobotStatus({ status: 'CHARGING', isOnline: false })).toBe('OFFLINE')
  })

  it('keeps maintenance and error, which matter more than the connection', () => {
    expect(shownRobotStatus({ status: 'MAINTENANCE', isOnline: false })).toBe('MAINTENANCE')
    expect(shownRobotStatus({ status: 'ERROR', isOnline: false })).toBe('ERROR')
  })
})

import { describe, expect, it } from 'vitest'
import { pathsFor, toTechRoute } from './consolePaths'

describe('toTechRoute', () => {
  it('maps robot screens into the Technician portal, keeping the rest of the route', () => {
    expect(toTechRoute('/monitor/fleet')).toBe('/tech/fleet')
    expect(toTechRoute('/monitor/fleet/RBT-001/manual')).toBe('/tech/fleet/RBT-001/manual')
    expect(toTechRoute('/monitor/fleet?robotId=abc')).toBe('/tech/fleet?robotId=abc')
    expect(toTechRoute('/monitor/jobs/42')).toBe('/tech/jobs/42')
    expect(toTechRoute('/operations/issues/7')).toBe('/tech/issues/7')
    expect(toTechRoute('/operations/robot-history?robot=RBT-001')).toBe('/tech/robot-history?robot=RBT-001')
    expect(toTechRoute('/operations/notifications')).toBe('/tech/notifications')
    expect(toTechRoute('/operations/audit')).toBe('/tech/audit')
  })

  it('leaves Technician routes as they are', () => {
    expect(toTechRoute('/tech/issues')).toBe('/tech/issues')
    expect(toTechRoute('/tech')).toBe('/tech')
  })

  it('has no route for admin-only screens', () => {
    expect(toTechRoute('/monitor/jobs')).toBeNull()
    expect(toTechRoute('/monitor/requests?requestId=1')).toBeNull()
    expect(toTechRoute('/configure/facility')).toBeNull()
    expect(toTechRoute('/management')).toBeNull()
    expect(toTechRoute('/dashboard')).toBeNull()
    expect(toTechRoute('/monitor/fleetX')).toBeNull()
    expect(toTechRoute('/technician')).toBeNull()
  })
})

describe('pathsFor', () => {
  it('builds the same screens under each portal', () => {
    const admin = pathsFor('admin')
    const tech = pathsFor('tech')
    expect(admin.robotManual('R1')).toBe('/monitor/fleet/R1/manual')
    expect(tech.robotManual('R1')).toBe('/tech/fleet/R1/manual')
    expect(admin.robotHistory('R 1')).toBe('/operations/robot-history?robot=R%201')
    expect(tech.robotHistory('R 1')).toBe('/tech/robot-history?robot=R%201')
    expect(tech.issues()).toBe('/tech/issues')
    expect(admin.translate('/monitor/requests')).toBe('/monitor/requests')
    expect(tech.translate('/monitor/requests')).toBeNull()
  })
})

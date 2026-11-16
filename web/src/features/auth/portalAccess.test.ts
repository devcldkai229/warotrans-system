import { describe, expect, it } from 'vitest'
import { adminRedirectFor, mayUseAdminPortal, mayUseTechPortal, techRedirectFor } from './portalAccess'

describe('portal access', () => {
  it('gives each role one portal', () => {
    expect(mayUseAdminPortal('TECHNICIAN')).toBe(false)
    expect(mayUseTechPortal('TECHNICIAN')).toBe(true)
    expect(mayUseAdminPortal('ADMIN')).toBe(true)
    expect(mayUseTechPortal('ADMIN')).toBe(false)
    expect(mayUseTechPortal('STAFF')).toBe(false)
  })

  it('sends a Technician to the same screen in their portal, else to its home', () => {
    expect(techRedirectFor('/monitor/fleet/RBT-001')).toBe('/tech/fleet/RBT-001')
    expect(techRedirectFor('/operations/issues/9')).toBe('/tech/issues/9')
    expect(techRedirectFor('/monitor/requests')).toBe('/tech/fleet')
    expect(techRedirectFor('/management?tab=accounts')).toBe('/tech/fleet')
  })

  it('sends an Admin who opens the Technician portal to the same screen in the admin console', () => {
    expect(adminRedirectFor('/tech/fleet/RBT-001/manual')).toBe('/monitor/fleet/RBT-001/manual')
    expect(adminRedirectFor('/tech/issues/9')).toBe('/operations/issues/9')
    expect(adminRedirectFor('/tech/robot-history?robot=R1')).toBe('/operations/robot-history?robot=R1')
    expect(adminRedirectFor('/tech')).toBe('/monitor/fleet')
  })
})

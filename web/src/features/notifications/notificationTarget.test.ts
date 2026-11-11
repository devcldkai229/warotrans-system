import { describe, expect, it } from 'vitest'
import { notificationTarget } from './notificationTarget'

const base = { route: null, entityType: null, entityId: null }

describe('notificationTarget', () => {
  it('prefers the route the server stored', () => {
    expect(notificationTarget({ route: '/monitor/jobs/abc', entityType: 'ROBOT', entityId: 'r1' })).toBe('/monitor/jobs/abc')
  })

  it('derives the screen from the entity when there is no stored route', () => {
    expect(notificationTarget({ ...base, entityType: 'JOB', entityId: 'j1' })).toBe('/monitor/jobs/j1')
    expect(notificationTarget({ ...base, entityType: 'ISSUE', entityId: 'i1' })).toBe('/operations/issues/i1')
  })

  it('keeps the id for requests and robots, so the page can open the right one', () => {
    expect(notificationTarget({ ...base, entityType: 'REQUEST', entityId: 'q1' })).toBe('/monitor/requests?requestId=q1')
    expect(notificationTarget({ ...base, entityType: 'ROBOT', entityId: 'r1' })).toBe('/monitor/fleet?robotId=r1')
  })

  it('has nowhere to go without an entity or for an unknown one', () => {
    expect(notificationTarget(base)).toBeNull()
    expect(notificationTarget({ ...base, entityType: 'ROBOT' })).toBeNull()
    expect(notificationTarget({ ...base, entityType: 'WAREHOUSE', entityId: 'w1' })).toBeNull()
  })
})

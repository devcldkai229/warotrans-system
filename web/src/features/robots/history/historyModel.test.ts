import { describe, expect, it } from 'vitest'
import type { RobotHistoryItem } from '@/shared/api/fleet'
import {
  describeDetails,
  describeHistoryItem,
  endOfDay,
  filtersAreActive,
  historyQuery,
  historyStatus,
  lineKey,
  NO_FILTERS,
  rangeIsBackwards,
  sourceApplies,
  startOfDay,
  uniqueLines,
  type HistoryFilters,
} from './historyModel'

function state(overrides: Partial<RobotHistoryItem> = {}): RobotHistoryItem {
  return {
    kind: 'STATE',
    occurredAt: '2026-11-11T06:26:00.544Z',
    fromStatus: 'EXECUTING',
    toStatus: 'AVAILABLE',
    reason: 'status',
    source: 'SYSTEM',
    jobId: null,
    commandId: null,
    commandType: null,
    commandStatus: null,
    commandOutcome: null,
    jobStepId: null,
    details: null,
    ...overrides,
  }
}

function command(overrides: Partial<RobotHistoryItem> = {}): RobotHistoryItem {
  return state({
    kind: 'COMMAND',
    fromStatus: null,
    toStatus: null,
    reason: null,
    source: null,
    commandId: 'cmd-1',
    commandType: 'NAVIGATE_TO_POSE',
    commandStatus: 'COMPLETED',
    ...overrides,
  })
}

const filters = (change: Partial<HistoryFilters>): HistoryFilters => ({ ...NO_FILTERS, ...change })

describe('describeHistoryItem', () => {
  it('says what a status change moved from; the new status goes in the badge', () => {
    expect(describeHistoryItem(state())).toBe('Status changed from Executing')
    expect(historyStatus(state())).toEqual({ label: 'Available', tone: 'green' })
  })

  it('has words for each reason the backend writes', () => {
    expect(describeHistoryItem(state({ reason: 'online' }))).toBe('Came online')
    expect(describeHistoryItem(state({ reason: 'offline' }))).toBe('Went offline')
    expect(describeHistoryItem(state({ reason: 'motion_held' }))).toBe('Motion held')
    expect(describeHistoryItem(state({ reason: 'motion_released' }))).toBe('Motion released')
  })

  it('reads a reason made of several codes, in the order the backend wrote them', () => {
    expect(describeHistoryItem(state({ reason: 'status,offline', fromStatus: 'AVAILABLE', toStatus: 'OFFLINE' }))).toBe(
      'Status changed from Available · Went offline',
    )
  })

  it('does not invent a "from" for the first state recorded', () => {
    expect(describeHistoryItem(state({ fromStatus: null }))).toBe('First status recorded')
  })

  it('shows a code it does not know as written, readable', () => {
    expect(describeHistoryItem(state({ reason: 'battery_swapped' }))).toBe('battery swapped')
  })

  it('still says something when a state has no reason', () => {
    expect(describeHistoryItem(state({ reason: null }))).toBe('State recorded')
  })

  it('names a command, with how it ended when it did', () => {
    expect(describeHistoryItem(command())).toBe('Navigate to pose')
    expect(describeHistoryItem(command({ commandOutcome: 'SUCCEEDED' }))).toBe('Navigate to pose: Succeeded')
    expect(describeHistoryItem(command({ commandOutcome: 'robot_offline' }))).toBe('Navigate to pose: robot offline')
  })
})

describe('describeDetails', () => {
  it('says the battery and the error the robot had when the state was recorded', () => {
    expect(describeDetails(state({ details: { batteryPercent: 18, errorCode: 'LIDAR_TIMEOUT' } }))).toBe('Battery 18% · Error LIDAR_TIMEOUT')
    expect(describeDetails(state({ details: { batteryPercent: 76.4, errorCode: null } }))).toBe('Battery 76%')
  })

  it('says a battery nobody measured is unknown, never 0 %', () => {
    expect(describeDetails(state({ details: { batteryPercent: null, errorCode: null } }))).toBe('Battery unknown')
    expect(describeDetails(state({ details: { batteryPercent: 0, errorCode: null } }))).toBe('Battery 0%')
  })

  it('shows an error without a battery when the line kept only that', () => {
    expect(describeDetails(state({ details: { errorCode: ' E_STOP ' } }))).toBe('Error E_STOP')
  })

  it('has nothing to say for an older line, a command, or details it cannot read', () => {
    expect(describeDetails(state({ details: null }))).toBeNull()
    expect(describeDetails(command())).toBeNull()
    expect(describeDetails(state({ details: {} }))).toBeNull()
    expect(describeDetails(state({ details: 'oops' as never }))).toBeNull()
  })
})

describe('historyStatus', () => {
  it('colours a command by how it stands', () => {
    expect(historyStatus(command())).toEqual({ label: 'Completed', tone: 'green' })
    expect(historyStatus(command({ commandStatus: 'TIMEOUT' }))?.tone).toBe('red')
    expect(historyStatus(command({ commandStatus: 'RUNNING' }))?.tone).toBe('blue')
  })

  it('shows nothing for a line with no status, and grey for one it does not know', () => {
    expect(historyStatus(state({ toStatus: null }))).toBeNull()
    expect(historyStatus(state({ toStatus: 'SOMETHING_NEW' }))?.tone).toBe('grey')
  })
})

describe('the filters', () => {
  it('are not active until something is chosen', () => {
    expect(filtersAreActive(NO_FILTERS)).toBe(false)
    expect(filtersAreActive(filters({ source: 'OPERATOR' }))).toBe(true)
    expect(filtersAreActive(filters({ toDate: '2026-11-10' }))).toBe(true)
  })

  it('ask only for the page when nothing is chosen', () => {
    expect(historyQuery(NO_FILTERS, 40, 20)).toEqual({ skip: 40, take: 20 })
  })

  it('pass kind and source to the server', () => {
    expect(historyQuery(filters({ kind: 'STATE', source: 'OPERATOR' }), 0, 20)).toEqual({
      skip: 0,
      take: 20,
      kind: 'STATE',
      source: 'OPERATOR',
    })
  })

  it('leave the source out while only commands are asked for, because a command has none', () => {
    const only = filters({ kind: 'COMMAND', source: 'OPERATOR' })

    expect(sourceApplies(only)).toBe(false)
    expect(historyQuery(only, 0, 20).source).toBeUndefined()
    expect(sourceApplies(filters({ kind: 'STATE' }))).toBe(true)
    expect(sourceApplies(NO_FILTERS)).toBe(true)
  })

  it('turn a date into the start and the end of that day, so the "to" day is included', () => {
    expect(startOfDay('2026-11-10')).toBe(new Date('2026-11-10T00:00:00').toISOString())
    expect(endOfDay('2026-11-10')).toBe(new Date('2026-11-10T23:59:59.999').toISOString())
    expect(historyQuery(filters({ fromDate: '2026-11-09', toDate: '2026-11-10' }), 0, 20)).toMatchObject({
      from: startOfDay('2026-11-09'),
      to: endOfDay('2026-11-10'),
    })
  })

  it('ignore an empty or unreadable date instead of sending it', () => {
    expect(startOfDay('')).toBeNull()
    expect(startOfDay('10/11/2026')).toBeNull()
    expect(endOfDay('2026-13-45')).toBeNull()
    expect(historyQuery(filters({ fromDate: 'nope' }), 0, 20)).toEqual({ skip: 0, take: 20 })
  })

  it('know a range that ends before it starts, and accept one day', () => {
    expect(rangeIsBackwards(filters({ fromDate: '2026-11-11', toDate: '2026-11-10' }))).toBe(true)
    expect(rangeIsBackwards(filters({ fromDate: '2026-11-10', toDate: '2026-11-10' }))).toBe(false)
    expect(rangeIsBackwards(filters({ fromDate: '2026-11-10' }))).toBe(false)
    expect(rangeIsBackwards(NO_FILTERS)).toBe(false)
  })
})

describe('uniqueLines', () => {
  it('shows a line once when a page boundary repeats it, and keeps lines that only look alike', () => {
    const a = state()
    const sameInstantOtherReason = state({ reason: 'offline' })
    const sameCommandTwice = [command(), command()]

    const result = uniqueLines([a, { ...a }, sameInstantOtherReason, ...sameCommandTwice])

    expect(result).toHaveLength(3)
    expect(lineKey(a)).not.toBe(lineKey(sameInstantOtherReason))
  })
})

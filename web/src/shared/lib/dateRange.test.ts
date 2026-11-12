import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayCount,
  formatRange,
  MAX_RANGE_DAYS,
  presetRange,
  rangeProblem,
  rangeWindow,
  readRange,
  writeRange,
} from './dateRange'

const TODAY = '2026-11-12'

describe('presetRange', () => {
  it('counts today as one of the days', () => {
    expect(presetRange('today', TODAY)).toEqual({ from: TODAY, to: TODAY })
    expect(presetRange('7d', TODAY)).toEqual({ from: '2026-11-06', to: TODAY })
    expect(dayCount(presetRange('30d', TODAY))).toBe(30)
    expect(dayCount(presetRange('90d', TODAY))).toBe(90)
  })

  it('knows yesterday and the calendar months', () => {
    expect(presetRange('yesterday', TODAY)).toEqual({ from: '2026-11-11', to: '2026-11-11' })
    expect(presetRange('this-month', TODAY)).toEqual({ from: '2026-11-01', to: TODAY })
    expect(presetRange('last-month', TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('crosses month and year ends', () => {
    expect(presetRange('yesterday', '2026-03-01')).toEqual({ from: '2026-02-28', to: '2026-02-28' })
    expect(presetRange('last-month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(presetRange('last-month', '2028-03-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('rangeProblem', () => {
  it('accepts a range in the past or up to today', () => {
    expect(rangeProblem({ from: '2026-10-01', to: '2026-10-31' }, TODAY)).toBeNull()
    expect(rangeProblem({ from: TODAY, to: TODAY }, TODAY)).toBeNull()
  })

  it('names what is wrong', () => {
    expect(rangeProblem({ from: '', to: TODAY }, TODAY)).toBe('incomplete')
    expect(rangeProblem({ from: '2026-11-10', to: '2026-11-01' }, TODAY)).toBe('backwards')
    expect(rangeProblem({ from: '2026-11-10', to: '2026-11-13' }, TODAY)).toBe('future')
    expect(rangeProblem({ from: addDays(TODAY, -MAX_RANGE_DAYS), to: TODAY }, TODAY)).toBe('too-long')
    expect(rangeProblem({ from: addDays(TODAY, -(MAX_RANGE_DAYS - 1)), to: TODAY }, TODAY)).toBeNull()
  })
})

describe('rangeWindow', () => {
  it('runs from Vietnam midnight to the midnight after the last day', () => {
    const now = new Date('2026-11-12T10:00:00Z')
    const window = rangeWindow({ from: '2026-10-01', to: '2026-10-31' }, now)
    expect(window.from.toISOString()).toBe('2026-09-30T17:00:00.000Z')
    expect(window.to.toISOString()).toBe('2026-10-31T17:00:00.000Z')
  })

  it('stops at now when the range reaches today', () => {
    const now = new Date('2026-11-12T10:00:00Z')
    expect(rangeWindow({ from: '2026-11-06', to: TODAY }, now).to).toEqual(now)
  })
})

describe('readRange / writeRange', () => {
  const read = (search: string) => readRange(new URLSearchParams(search), TODAY)

  it('reads a preset, fixed dates, and falls back on anything else', () => {
    expect(read('range=last-month')).toEqual({ preset: 'last-month', range: { from: '2026-10-01', to: '2026-10-31' } })
    expect(read('from=2026-09-01&to=2026-09-15')).toEqual({ preset: null, range: { from: '2026-09-01', to: '2026-09-15' } })
    expect(read('').preset).toBe('7d')
    expect(read('range=forever').preset).toBe('7d')
    expect(read('from=2026-11-10&to=2026-11-01').preset).toBe('7d')
    expect(read('from=2026-11-10&to=2027-01-01').preset).toBe('7d')
  })

  it('writes one form at a time and keeps other parameters', () => {
    const base = new URLSearchParams('tab=x&range=30d')
    expect(writeRange(base, { range: { from: '2026-09-01', to: '2026-09-15' } }).toString()).toBe('tab=x&from=2026-09-01&to=2026-09-15')
    expect(writeRange(new URLSearchParams('from=a&to=b'), { preset: '90d' }).toString()).toBe('range=90d')
    expect(writeRange(base, { preset: '7d' }).toString()).toBe('tab=x')
  })
})

describe('formatRange', () => {
  it('drops the repeated year', () => {
    expect(formatRange({ from: TODAY, to: TODAY })).toBe('12/11/2026')
    expect(formatRange({ from: '2026-10-14', to: TODAY })).toBe('14/10 – 12/11/2026')
    expect(formatRange({ from: '2025-12-20', to: '2026-01-05' })).toBe('20/12/2025 – 05/01/2026')
  })
})

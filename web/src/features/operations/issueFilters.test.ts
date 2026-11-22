import { describe, expect, it } from 'vitest'
import { clearIssueFilters, hasIssueFilters, readIssueFilters, writeReportedRange } from './issueFilters'

const today = '2026-11-22'
const read = (query: string) => readIssueFilters(new URLSearchParams(query), today)

describe('issue filters in the address', () => {
  it('reads nothing as all types, severities, statuses and any time', () => {
    expect(read('')).toEqual({ type: '', severity: '', status: '', reported: null })
    expect(hasIssueFilters(read(''))).toBe(false)
  })

  it('reads the type, severity, status and a preset range', () => {
    const filters = read('type=CONTAINER&severity=HIGH&status=OPEN&range=7d')

    expect(filters).toMatchObject({ type: 'CONTAINER', severity: 'HIGH', status: 'OPEN' })
    expect(filters.reported).toEqual({ preset: '7d', range: { from: '2026-11-16', to: '2026-11-22' } })
    expect(hasIssueFilters(filters)).toBe(true)
  })

  it('reads two fixed dates', () => {
    expect(read('from=2026-11-01&to=2026-11-20').reported).toEqual({ preset: null, range: { from: '2026-11-01', to: '2026-11-20' } })
  })

  it('treats unknown or broken values as all, never hiding issues behind a range it cannot read', () => {
    const filters = read('type=ROBOTS&severity=urgent&status=done&range=forever&from=2026-11-20&to=2026-11-01')

    expect(filters).toEqual({ type: '', severity: '', status: '', reported: null })
    expect(read('from=2026-11-01').reported).toBeNull()
    expect(read('from=2026-11-01&to=2026-12-31').reported).toBeNull() // ends after today
  })

  it('counts the type tab apart from the other filters', () => {
    expect(hasIssueFilters(read('type=JOB'))).toBe(false)
  })

  it('writes every preset, fixed dates, or nothing for any time, and goes back to page 1', () => {
    const base = new URLSearchParams('type=JOB&page=3&from=2026-11-01&to=2026-11-02')

    expect(writeReportedRange(base, { preset: '7d' }).toString()).toBe('type=JOB&range=7d')
    expect(writeReportedRange(base, { range: { from: '2026-11-05', to: '2026-11-06' } }).toString()).toBe(
      'type=JOB&from=2026-11-05&to=2026-11-06',
    )
    expect(writeReportedRange(base, null).toString()).toBe('type=JOB')
  })

  it('clears every filter and the page, keeping anything else', () => {
    const cleared = clearIssueFilters(new URLSearchParams('type=JOB&severity=LOW&status=OPEN&range=30d&page=2&x=1'))

    expect(cleared.toString()).toBe('x=1')
  })
})

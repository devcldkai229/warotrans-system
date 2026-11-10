import { describe, expect, it } from 'vitest'
import { formatDuration } from './format'

describe('formatDuration', () => {
  it('shows minutes and seconds under an hour', () => {
    expect(formatDuration(0)).toBe('00m 00s')
    expect(formatDuration(545.4)).toBe('09m 05s')
    expect(formatDuration(3599)).toBe('59m 59s')
  })

  it('shows hours and minutes from one hour', () => {
    expect(formatDuration(3600)).toBe('1h 00m')
    expect(formatDuration(2 * 3600 + 5 * 60 + 59)).toBe('2h 05m')
  })

  it('shows days and hours from one day', () => {
    expect(formatDuration(86_400)).toBe('1d 0h')
    expect(formatDuration(607_736)).toBe('7d 0h')
  })

  it('never goes negative', () => {
    expect(formatDuration(-5)).toBe('00m 00s')
  })
})

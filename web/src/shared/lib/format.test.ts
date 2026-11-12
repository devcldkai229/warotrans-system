import { describe, expect, it } from 'vitest'
import {
  appToday,
  endOfAppDay,
  formatClock,
  formatDateTime,
  formatDateTimeFull,
  formatDateTimeWithYear,
  formatDuration,
  formatIfDateTime,
  formatIsoDateTime,
  formatValue,
  jsonText,
  parseInstant,
  secondsBetween,
  startOfAppDay,
  windowOfDays,
} from './format'

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

// What the server writes is UTC; the screen shows Vietnam (UTC+7), whatever the zone of the machine running this.
describe('times are shown in Vietnam', () => {
  const written = '2026-11-11T07:39:05.1558969+00:00'

  it('shows the date and the time in Vietnam', () => {
    expect(formatDateTimeWithYear(written)).toBe('11/11/2026 14:39')
    expect(formatDateTime(written)).toBe('11/11 14:39')
    expect(formatDateTimeFull(written)).toBe('11/11/2026 14:39:05')
    expect(formatClock(written)).toBe('14:39:05')
    expect(formatIsoDateTime(written)).toBe('2026-11-11 14:39')
  })

  it('moves to the next day when Vietnam is already there', () => {
    expect(formatDateTimeFull('2026-11-11T18:30:00Z')).toBe('12/11/2026 01:30:00')
    expect(formatDateTimeFull('2026-12-31T17:00:00Z')).toBe('01/01/2027 00:00:00')
  })

  it('reads the same instant written with another offset', () => {
    expect(formatDateTimeFull('2026-11-11T14:39:05+07:00')).toBe('11/11/2026 14:39:05')
    expect(formatDateTimeFull('2026-11-11T21:39:05+14:00')).toBe('11/11/2026 14:39:05')
  })

  it("reads more than three fractional digits, and a time without a zone as the server's (UTC)", () => {
    expect(parseInstant('2026-11-11T07:39:05.1558969+00:00').toISOString()).toBe('2026-11-11T07:39:05.155Z')
    expect(formatDateTimeFull('2026-11-11T07:39:05')).toBe('11/11/2026 14:39:05')
  })

  it('shows a dash for nothing and for what is not a time', () => {
    expect(formatDateTimeFull(null)).toBe('—')
    expect(formatDateTimeWithYear('')).toBe('—')
    expect(formatClock('not a time')).toBe('—')
  })

  it('measures a gap between two timestamps whatever the fraction they carry', () => {
    expect(secondsBetween('2026-11-11T07:39:05.1558969+00:00', '2026-11-11T07:40:05.1558969+00:00')).toBeCloseTo(60, 3)
  })
})

describe('formatIfDateTime', () => {
  it('turns a timestamp into the date and time, in Vietnam', () => {
    expect(formatIfDateTime('2026-11-11T07:39:05.1558969+00:00')).toBe('11/11/2026 14:39:05')
    expect(formatIfDateTime('2026-11-11T07:39:05Z')).toBe('11/11/2026 14:39:05')
    expect(formatIfDateTime('2026-11-11T07:39Z')).toBe('11/11/2026 14:39:00')
  })

  it('leaves everything else as it is: ids, words, numbers and a date alone', () => {
    expect(formatIfDateTime('e0659df6-763f-43e9-8b79-e2657e59e819')).toBeNull()
    expect(formatIfDateTime('IN_PROGRESS')).toBeNull()
    expect(formatIfDateTime('25')).toBeNull()
    expect(formatIfDateTime('2026-11-11')).toBeNull()
    expect(formatIfDateTime('active')).toBeNull()
    expect(formatIfDateTime('2026-13-45T99:99:99Z')).toBeNull()
  })
})

describe('days in Vietnam', () => {
  it('starts a day at 00:00 Vietnam, which is 17:00 UTC the evening before', () => {
    expect(startOfAppDay('2026-11-10')?.toISOString()).toBe('2026-11-09T17:00:00.000Z')
    expect(endOfAppDay('2026-11-10')?.toISOString()).toBe('2026-11-10T16:59:59.999Z')
    expect(startOfAppDay('10/11/2026')).toBeNull()
    expect(startOfAppDay('2026-13-45')).toBeNull()
  })

  it('knows what day it is in Vietnam when it is still the day before in UTC', () => {
    expect(appToday(new Date('2026-11-11T18:30:00Z'))).toBe('2026-11-12')
    expect(appToday(new Date('2026-11-11T16:59:00Z'))).toBe('2026-11-11')
  })

  it('reports on the last days from midnight in Vietnam: today is one day, 7 days is today and the six before', () => {
    const now = new Date('2026-11-11T18:30:00Z') // 01:30 on the 12th in Vietnam

    expect(windowOfDays(1, now).from.toISOString()).toBe('2026-11-11T17:00:00.000Z')
    expect(windowOfDays(7, now).from.toISOString()).toBe('2026-11-05T17:00:00.000Z')
    expect(windowOfDays(30, now).from.toISOString()).toBe('2026-10-13T17:00:00.000Z')
    expect(windowOfDays(7, now).to).toBe(now)
  })

  it('counts days across a month end', () => {
    expect(windowOfDays(3, new Date('2026-03-01T05:00:00Z')).from.toISOString()).toBe('2026-02-26T17:00:00.000Z')
  })
})

describe('formatValue and jsonText', () => {
  it('shows a timestamp value as the date and time in Vietnam, and every other value as it is', () => {
    expect(formatValue('2026-11-11T07:39:05.1558969+00:00')).toBe('11/11/2026 14:39:05')
    expect(formatValue('active')).toBe('active')
    expect(formatValue(1)).toBe('1')
    expect(formatValue(true)).toBe('true')
    expect(formatValue(null)).toBe('null')
  })

  it('reads the timestamps inside an object or a list, and leaves the rest of it alone', () => {
    expect(formatValue({ checkedAt: '2026-11-11T07:39:05Z', reason: 'active', n: 2 })).toBe('{"checkedAt":"11/11/2026 14:39:05","reason":"active","n":2}')
    expect(jsonText(['2026-11-11T07:39:05Z', 'x'])).toBe('["11/11/2026 14:39:05","x"]')
  })

  it('writes a value of nothing as a word, not as an empty text', () => {
    expect(jsonText(undefined)).toBe('undefined')
  })
})

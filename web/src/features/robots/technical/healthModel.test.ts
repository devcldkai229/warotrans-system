import { afterEach, describe, expect, it } from 'vitest'
import type { RobotHealth } from '@/shared/api/fleet'
import { setLanguageForTests } from '@/shared/i18n'
import { ageSeconds, buildHealthGroups, countHealth, formatAge, freshnessOfTime, groupOf, healthItemLabel, readBattery } from './healthModel'

afterEach(() => setLanguageForTests('en'))

const NOW = new Date('2026-11-10T10:00:00Z')
const at = (secondsAgo: number) => new Date(NOW.getTime() - secondsAgo * 1000).toISOString()

function snapshot(items: RobotHealth['items'], overrides: Partial<RobotHealth> = {}): RobotHealth {
  return { robotId: 'r1', robotCode: 'RBT-001', overall: 'OK', receivedAt: at(2), stale: false, items, ...overrides }
}
const item = (name: string, level: RobotHealth['items'][number]['level'], value: number | null = null, unit: string | null = null, message: string | null = null) => ({
  name, level, value, unit, message, measuredAt: at(2),
})

describe('buildHealthGroups', () => {
  it('has no groups before the robot ever reported, instead of a wall of "unknown"', () => {
    expect(buildHealthGroups(undefined)).toEqual([])
    expect(buildHealthGroups(snapshot([], { receivedAt: null, overall: 'UNKNOWN' }))).toEqual([])
  })

  it('sorts items into sensors, localization and navigation, and the computer', () => {
    const groups = buildHealthGroups(
      snapshot([item('lidar', 'OK', 6.8, 'Hz'), item('imu', 'WARN'), item('nav2', 'OK'), item('cpu_load', 'OK', 31, '%')]),
    )

    expect(groups.map((g) => g.id)).toEqual(['sensors', 'navigation', 'computer'])
    expect(groups[0].rows.map((r) => r.key)).toEqual(['lidar', 'imu'])
    expect(groups[0].rows[0]).toMatchObject({ label: 'LiDAR', value: '6.8 Hz', freshness: 'live', level: 'OK' })
  })

  it('tells a value the robot cannot measure from one it never sent, and from one that went stale', () => {
    const groups = buildHealthGroups(
      snapshot([
        item('tf_localization', 'OK'),
        item('nav2', 'STALE'),
        item('cpu_temperature', 'UNKNOWN', null, 'C', 'no thermal sensor'),
        // cpu_load and memory_available are never sent
      ]),
    )
    const rows = Object.fromEntries(groups.flatMap((g) => g.rows).map((r) => [r.key, r]))

    expect(rows.tf_localization.freshness).toBe('live')
    expect(rows.nav2.freshness).toBe('stale')
    expect(rows.cpu_temperature).toMatchObject({ freshness: 'not_measured', value: null, message: 'no thermal sensor' })
    expect(rows.cpu_load).toMatchObject({ freshness: 'not_reported', level: null, value: null })
    expect(rows.memory_available.freshness).toBe('not_reported')
  })

  it('does not report an absent sensor as a fault, since sensors are whatever the robot is configured with', () => {
    const rows = buildHealthGroups(snapshot([item('tf_localization', 'OK')])).flatMap((g) => g.rows)

    expect(rows.some((r) => r.key === 'lidar')).toBe(false)
  })

  it('marks everything stale once the whole snapshot is old', () => {
    const groups = buildHealthGroups(snapshot([item('lidar', 'OK', 6.8, 'Hz'), item('nav2', 'OK')], { stale: true, overall: 'STALE' }))

    expect(groups.flatMap((g) => g.rows).filter((r) => r.freshness !== 'not_reported').every((r) => r.freshness === 'stale')).toBe(true)
  })

  it('rounds values and gives an unknown item a readable name', () => {
    const groups = buildHealthGroups(snapshot([item('cpu_temperature', 'OK', 52.3333, 'C'), item('wheel_encoder', 'OK', 3, null)]))
    const rows = Object.fromEntries(groups.flatMap((g) => g.rows).map((r) => [r.key, r]))

    expect(rows.cpu_temperature.value).toBe('52.33 C')
    expect(rows.wheel_encoder).toMatchObject({ label: 'Wheel encoder', value: '3' })
    expect(groupOf('wheel_encoder')).toBe('sensors')
    expect(healthItemLabel('nav2')).toBe('Nav2')
  })
})

describe('countHealth', () => {
  it('counts each state once, a warning and an error among the live rows', () => {
    const groups = buildHealthGroups(
      snapshot([item('lidar', 'OK'), item('imu', 'WARN'), item('odometry', 'ERROR'), item('nav2', 'STALE'), item('cpu_temperature', 'UNKNOWN')]),
    )

    expect(countHealth(groups)).toEqual({ live: 1, warn: 1, error: 1, stale: 1, notMeasured: 1, notReported: 3 })
  })
})

describe('ages', () => {
  it('words how long ago something was, in the interface language', () => {
    expect(formatAge(at(5), NOW)).toBe('5 s ago')
    expect(formatAge(at(180), NOW)).toBe('3 min ago')
    expect(formatAge(at(7200), NOW)).toBe('2 h ago')
    expect(formatAge(null, NOW)).toBe('—')
    setLanguageForTests('vi')
    expect(formatAge(at(5), NOW)).toBe('5 giây trước')
  })

  it('calls a reading stale only past its limit, and a missing one not reported', () => {
    expect(freshnessOfTime(at(10), 15, NOW)).toBe('live')
    expect(freshnessOfTime(at(16), 15, NOW)).toBe('stale')
    expect(freshnessOfTime(null, 15, NOW)).toBe('not_reported')
    expect(ageSeconds(at(42), NOW)).toBe(42)
  })
})

describe('readBattery', () => {
  const robot = { batteryPercent: 76, batteryVoltage: 24.123, batteryEstimationMode: 'VOLTAGE_CURVE', batteryConfidence: 'HIGH', batteryMeasuredAt: at(5), status: 'AVAILABLE' as const }

  it('keeps what the robot said about its battery and marks it live', () => {
    expect(readBattery(robot, NOW)).toEqual({ percent: 76, voltage: '24.12 V', mode: 'VOLTAGE_CURVE', confidence: 'HIGH', charging: false, measuredAt: at(5), freshness: 'live' })
  })

  it('never turns a missing value into zero', () => {
    const reading = readBattery({ ...robot, batteryPercent: null, batteryVoltage: undefined, batteryEstimationMode: null, batteryConfidence: undefined, batteryMeasuredAt: null }, NOW)

    expect(reading).toMatchObject({ percent: null, voltage: null, mode: null, confidence: null, freshness: 'not_reported' })
  })

  it('shows an old reading stale, and a charging robot as charging', () => {
    expect(readBattery({ ...robot, batteryMeasuredAt: at(300) }, NOW).freshness).toBe('stale')
    expect(readBattery({ ...robot, status: 'CHARGING' }, NOW).charging).toBe(true)
  })
})

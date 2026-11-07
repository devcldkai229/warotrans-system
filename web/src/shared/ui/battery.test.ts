import { describe, expect, it } from 'vitest'
import type { RobotBattery } from '@/shared/api/contracts'
import { batteryDetail, batteryDispatchLabel, batteryTone, formatBatteryPercent, isBatteryKnown } from './battery'

const battery = (over: Partial<RobotBattery> = {}): RobotBattery => ({
  percent: 63.4,
  voltage: 11.432,
  estimationMode: 'VOLTAGE_ONLY',
  confidence: 'LOW',
  chargingState: 'UNKNOWN',
  updatedAt: '2026-11-06T09:00:00Z',
  isStale: false,
  dispatchStatus: 'ELIGIBLE',
  dispatchAllowed: true,
  ...over,
})

describe('battery formatting', () => {
  it('shows Unknown for a null or missing battery, never 0 %', () => {
    expect(formatBatteryPercent(null)).toBe('Unknown')
    expect(formatBatteryPercent(undefined)).toBe('Unknown')
    expect(formatBatteryPercent(Number.NaN)).toBe('Unknown')
    expect(isBatteryKnown(null)).toBe(false)
  })

  it('rounds a known battery and keeps a real 0 %', () => {
    expect(formatBatteryPercent(63.4)).toBe('63%')
    expect(formatBatteryPercent(0)).toBe('0%')
    expect(isBatteryKnown(0)).toBe(true)
  })

  it('tones by the configured low threshold, grey when unknown', () => {
    expect(batteryTone(null)).toBe('grey')
    expect(batteryTone(20)).toBe('red')
    expect(batteryTone(35)).toBe('amber')
    expect(batteryTone(35, 15)).toBe('green')
    expect(batteryTone(80)).toBe('green')
  })

  it('describes voltage, mode, confidence and staleness', () => {
    expect(batteryDetail(battery())).toBe('11.43 V · Voltage estimate · Low confidence')
    expect(batteryDetail(battery({ isStale: true }))).toBe('11.43 V · Voltage estimate · Low confidence · Stale')
    expect(batteryDetail(battery({ percent: null, voltage: null, estimationMode: 'UNAVAILABLE', confidence: 'NONE', isStale: true })))
      .toBe('No sensor reading')
    expect(batteryDetail(null)).toBe('')
  })

  it('only mentions charging when it is confirmed', () => {
    expect(batteryDetail(battery({ chargingState: 'UNKNOWN' }))).not.toContain('Charging')
    expect(batteryDetail(battery({ chargingState: 'CHARGING' }))).toContain('Charging')
  })

  it('explains why a robot is not dispatched', () => {
    expect(batteryDispatchLabel(battery())).toBe('Can take Jobs')
    expect(batteryDispatchLabel(battery({ dispatchStatus: 'UNKNOWN', dispatchAllowed: false }))).toBe('Battery unknown — not dispatched')
    expect(batteryDispatchLabel(battery({ dispatchStatus: 'UNKNOWN', dispatchAllowed: true }))).toContain('development override')
    expect(batteryDispatchLabel(battery({ dispatchStatus: 'LOW', dispatchAllowed: false }))).toBe('Battery too low for new Jobs')
  })
})

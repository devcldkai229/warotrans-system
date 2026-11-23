import { describe, expect, it } from 'vitest'
import { autoLocalizeTone, reportsOtherMap, robotsOffPublishedMap, scorePercent } from './robotMaps'

describe('robotsOffPublishedMap', () => {
  const robots = [
    { code: 'RBT-001', warehouseId: 'w1', currentMapVersionId: 'v13' },
    { code: 'RBT-002', warehouseId: 'w1', currentMapVersionId: 'v19' },
    { code: 'RBT-009', warehouseId: 'w2', currentMapVersionId: 'v1' },
  ]

  it('lists the robots of the warehouse that are on another map', () => {
    expect(robotsOffPublishedMap(robots, 'w1', 'v19').map((r) => r.code)).toEqual(['RBT-001'])
  })

  it('lists none while the warehouse or its published map is unknown', () => {
    expect(robotsOffPublishedMap(robots, null, 'v19')).toEqual([])
    expect(robotsOffPublishedMap(robots, 'w1', null)).toEqual([])
  })
})

describe('reportsOtherMap', () => {
  it('is true only for an online robot reporting a different map code', () => {
    expect(reportsOtherMap({ isOnline: true, mapVersionCode: 'MAP-ONE-V013' }, 'MAP-ONE-V019')).toBe(true)
    expect(reportsOtherMap({ isOnline: true, mapVersionCode: 'map-one-v019 ' }, 'MAP-ONE-V019')).toBe(false)
    expect(reportsOtherMap({ isOnline: false, mapVersionCode: 'MAP-ONE-V013' }, 'MAP-ONE-V019')).toBe(false)
    expect(reportsOtherMap({ isOnline: true, mapVersionCode: null }, 'MAP-ONE-V019')).toBe(false)
  })
})

describe('autoLocalizeTone', () => {
  it('tells running, sure, unsure and refused apart', () => {
    expect(autoLocalizeTone({ state: 'RUNNING', errorCode: null })).toBe('blue')
    expect(autoLocalizeTone({ state: 'SUCCEEDED', errorCode: null })).toBe('green')
    expect(autoLocalizeTone({ state: 'FAILED', errorCode: 'LOCALIZATION_AMBIGUOUS' })).toBe('amber')
    expect(autoLocalizeTone({ state: 'FAILED', errorCode: 'LOCALIZATION_NO_SCAN' })).toBe('red')
    expect(autoLocalizeTone({ state: 'REJECTED', errorCode: null })).toBe('red')
    expect(autoLocalizeTone(null)).toBe('grey')
  })
})

describe('scorePercent', () => {
  it('rounds and clamps', () => {
    expect(scorePercent(0.934)).toBe('93%')
    expect(scorePercent(1.2)).toBe('100%')
    expect(scorePercent(null)).toBe('—')
  })
})

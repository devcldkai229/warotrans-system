import { describe, expect, it } from 'vitest'
import { pickableMaps, resolveMonitorMapId } from './resolveMonitorMap'

const maps = [
  { id: 'v19', status: 'ARCHIVED', versionNo: 19 },
  { id: 'v21', status: 'ARCHIVED', versionNo: 21 },
  { id: 'v23', status: 'DRAFT', versionNo: 23 },
  { id: 'v24', status: 'PUBLISHED', versionNo: 24 },
]
const base = { maps, manualId: null, preferredId: null, storedId: null, activeId: 'v24' }

describe('resolveMonitorMapId', () => {
  it('drops a remembered pick of a map that has since been archived and shows the published one', () => {
    expect(resolveMonitorMapId({ ...base, storedId: 'v19' })).toBe('v24')
  })

  it('keeps a remembered pick that is still current', () => {
    expect(resolveMonitorMapId({ ...base, storedId: 'v23' })).toBe('v23')
  })

  it('a pick on the page wins over the robot map and the remembered one', () => {
    expect(resolveMonitorMapId({ ...base, manualId: 'v21', preferredId: 'v19', storedId: 'v23' })).toBe('v21')
  })

  it('follows the selected robot map when nothing was picked', () => {
    expect(resolveMonitorMapId({ ...base, preferredId: 'v21' })).toBe('v21')
  })
})

describe('pickableMaps', () => {
  it('offers the published maps, plus the shown one when it is not published, newest first', () => {
    expect(pickableMaps(maps, 'v19').map((m) => m.id)).toEqual(['v24', 'v19'])
    expect(pickableMaps(maps, 'v24').map((m) => m.id)).toEqual(['v24'])
  })
})

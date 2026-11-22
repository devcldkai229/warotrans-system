import { describe, expect, it } from 'vitest'
import { applyFixedStops } from './fixedStops'
import type { MovementDraft } from './types'

const movement = (over: Partial<MovementDraft> = {}): MovementDraft => ({
  localId: 'm1',
  sequenceNo: 1,
  containerId: 'c1',
  sourceStorageLocationId: null,
  sourceEndpointId: '',
  sourceLevelNo: null,
  destinationStorageLocationId: null,
  destinationEndpointId: '',
  destinationLevelNo: null,
  ...over,
})

describe('applyFixedStops', () => {
  it('starts every movement at the fixed pickup gate', () => {
    const [m] = applyFixedStops([movement({ sourceEndpointId: 'shelf', sourceStorageLocationId: 'loc', sourceLevelNo: 2 })], 'inbound', null)
    expect(m).toMatchObject({ sourceEndpointId: 'inbound', sourceStorageLocationId: null, sourceLevelNo: null })
  })

  it('ends every movement at the fixed dropoff gate and keeps the source', () => {
    const [m] = applyFixedStops([movement({ sourceEndpointId: 'shelf', destinationEndpointId: 'inspection' })], null, 'outbound')
    expect(m).toMatchObject({ sourceEndpointId: 'shelf', destinationEndpointId: 'outbound', destinationStorageLocationId: null })
  })

  it('returns the same array when nothing is fixed or everything already matches', () => {
    const list = [movement({ sourceEndpointId: 'inbound' })]
    expect(applyFixedStops(list, null, null)).toBe(list)
    expect(applyFixedStops(list, 'inbound', null)).toBe(list)
  })
})

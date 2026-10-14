import { describe, expect, it } from 'vitest'
import { coerceWorkflowInputValue, toCreateRequestBody } from './toCreateRequestBody'
import type { TransportRequestDraft } from './types'

const draft: TransportRequestDraft = {
  warehouseId: 'wh-1',
  mapVersionId: 'map-1',
  workflowId: 'wf-1',
  workflowInputs: {
    handlingInstruction: 'fragile',
    priority: '2',
    rush: 'yes',
    empty: '',
  },
  note: 'note',
  movements: [
    {
      localId: 'm1',
      sequenceNo: 1,
      containerId: 'c1',
      sourceStorageLocationId: null,
      sourceEndpointId: 'ep-a',
      sourceLevelNo: null,
      destinationStorageLocationId: 'loc-d',
      destinationEndpointId: 'ep-d',
      destinationLevelNo: 2,
    },
  ],
}

describe('toCreateRequestBody', () => {
  it('maps draft to API body without client-owned fields', () => {
    const body = toCreateRequestBody(draft, {
      handlingInstruction: 'STRING',
      priority: 'INTEGER',
      rush: 'BOOLEAN',
    })

    expect(body).toEqual({
      warehouseId: 'wh-1',
      mapVersionId: 'map-1',
      workflowId: 'wf-1',
      workflowInputs: {
        handlingInstruction: 'fragile',
        priority: 2,
        rush: true,
      },
      note: 'note',
      details: [
        {
          sequenceNo: 1,
          containerId: 'c1',
          sourceStorageLocationId: null,
          sourceEndpointId: 'ep-a',
          sourceLevelNo: null,
          destinationStorageLocationId: 'loc-d',
          destinationEndpointId: 'ep-d',
          destinationLevelNo: 2,
        },
      ],
    })
    expect(body).not.toHaveProperty('id')
    expect(body).not.toHaveProperty('requestCode')
    expect(body).not.toHaveProperty('requestedBy')
    expect(body).not.toHaveProperty('status')
  })
})

describe('coerceWorkflowInputValue', () => {
  it('coerces common STAFF_INPUT data types', () => {
    expect(coerceWorkflowInputValue('INTEGER', '12')).toBe(12)
    expect(coerceWorkflowInputValue('DECIMAL', '1.5')).toBe(1.5)
    expect(coerceWorkflowInputValue('BOOLEAN', 'No')).toBe(false)
    expect(coerceWorkflowInputValue('UUID', '11111111-1111-1111-1111-111111111111')).toBe(
      '11111111-1111-1111-1111-111111111111',
    )
  })
})

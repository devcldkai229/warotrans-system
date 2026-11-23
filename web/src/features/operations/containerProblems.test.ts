import { describe, expect, it } from 'vitest'
import { CONTAINER_PROBLEMS, holdText, outcomeOptions, outcomeResult, problemLabel, problemsFor } from './containerProblems'

describe('container problem codes', () => {
  it('match the backend list (ContainerProblemCodes.cs) in order', () => {
    expect(CONTAINER_PROBLEMS.map((p) => p.code)).toEqual([
      'WRONG_CONTAINER',
      'MISSING_CONTAINER',
      'CONTAINER_DAMAGED',
      'BARCODE_UNREADABLE',
      'UNSAFE_LOAD',
      'OTHER',
      'PRODUCT_MISMATCH',
      'QUANTITY_MISMATCH',
      'CONTENTS_DAMAGED',
      'PACKAGING_DEFECT',
    ])
    expect(CONTAINER_PROBLEMS.filter((p) => p.blocksHandover).map((p) => p.code)).toEqual(['WRONG_CONTAINER', 'MISSING_CONTAINER'])
  })

  it('offers only what is seen from outside at a handover, everything at the inspection', () => {
    const handover = problemsFor('HANDOVER').map((p) => p.code)
    expect(handover).not.toContain('QUANTITY_MISMATCH')
    expect(handover).not.toContain('PRODUCT_MISMATCH')
    expect(handover).toContain('CONTAINER_DAMAGED')
    expect(problemsFor('INSPECTION')).toHaveLength(CONTAINER_PROBLEMS.length)
  })

  it('names known, legacy and unknown codes', () => {
    expect(problemLabel('QUANTITY_MISMATCH')).toBe('Quantity mismatch')
    expect(problemLabel('container_reported_failed')).toBe('Reported failed')
    expect(problemLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW')
    expect(problemLabel(null)).toBe('—')
  })

  it('reads a held container with its reason', () => {
    expect(holdText('HOLD', 'CONTAINER_DAMAGED')).toBe('HOLD · Container damaged')
    expect(holdText('HOLD', 'OFF_SHELF')).toBe('HOLD · Set down off a shelf')
    expect(holdText('STORED', null)).toBe('STORED')
  })

  it('offers the outcomes the backend allows, worded for a packed box of goods', () => {
    const damaged = outcomeOptions('CONTENTS_DAMAGED', ['ADJUST_QUANTITY', 'SCRAP', 'RELEASE'])
    expect(damaged.map((o) => o.value)).toEqual(['ADJUST_QUANTITY', 'SCRAP', 'RELEASE'])
    expect(damaged[0].label).toBe('Partly damaged: keep the good goods')
    expect(outcomeOptions('QUANTITY_MISMATCH', ['ADJUST_QUANTITY'])[0].label).toBe('Record the real quantity')
    expect(outcomeOptions('PRODUCT_MISMATCH', ['SCRAP']).map((o) => o.label)).toEqual(['Scrap the whole package'])
    expect(outcomeOptions('OTHER', ['WRITE_OFF', 'RELEASE']).map((o) => o.value)).toEqual(['RELEASE'])
  })

  it('reads a package that left the stock by why it left', () => {
    expect(holdText('OUT_OF_SERVICE', null, 'SCRAP')).toBe('Scrapped')
    expect(holdText('OUT_OF_SERVICE', null, 'LOST')).toBe('Lost')
    expect(outcomeResult('REPACK')).toBe('Repacked')
    expect(outcomeResult('ADJUST_QUANTITY', 'CONTENTS_DAMAGED')).toBe('Partly damaged: keep the good goods')
    expect(outcomeResult('ADJUST_QUANTITY', 'QUANTITY_MISMATCH')).toBe('Record the real quantity')
    expect(outcomeResult(null)).toBeNull()
  })
})

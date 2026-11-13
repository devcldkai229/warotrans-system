import { describe, expect, it } from 'vitest'
import { groupContainers, ineligibleReason } from './containerEligibility'
import type { ComposerContainer } from './types'

function container(id: string, over: Partial<ComposerContainer> = {}): ComposerContainer {
  return {
    id,
    barcode: `CTN-${id}`,
    productName: 'Carton',
    sku: 'SKU',
    status: 'CREATED',
    currentStorageLocationId: null,
    currentLocationCode: null,
    currentLocationName: null,
    currentLevelNo: null,
    currentEndpointId: null,
    currentEndpointCode: null,
    currentEndpointName: null,
    voucher: null,
    ...over,
  }
}

const receipt = (id: string, code: string, confirmedAt: string) =>
  ({ id, code, type: 'INBOUND', status: 'CONFIRMED', createdAt: confirmedAt, confirmedAt }) as const

const shelved = { status: 'STORED' as const, currentStorageLocationId: 'L1', currentLocationCode: 'SHELF-A-01', currentLevelNo: 1 }

describe('ineligibleReason', () => {
  it('INBOUND takes a container not on a shelf that is on a confirmed receiving voucher', () => {
    expect(ineligibleReason(container('1', { voucher: receipt('v', 'PN-1', '2026-11-13T00:00:00Z') }), 'INBOUND')).toBeNull()
    expect(ineligibleReason(container('2'), 'INBOUND')).toBe('Not on a confirmed receiving voucher')
    expect(ineligibleReason(container('3', { ...shelved, voucher: receipt('v', 'PN-1', '2026-11-13T00:00:00Z') }), 'INBOUND')).toBe(
      'Already on a shelf',
    )
  })

  it('OUTBOUND needs a container on a shelf and a confirmed issue voucher; INTERNAL only a shelf', () => {
    const issue = { id: 'x', code: 'PX-1', type: 'OUTBOUND', status: 'CONFIRMED', createdAt: '', confirmedAt: '' }
    expect(ineligibleReason(container('1', { ...shelved, voucher: issue }), 'OUTBOUND')).toBeNull()
    expect(ineligibleReason(container('2', shelved), 'OUTBOUND')).toBe('Not on a confirmed issue voucher')
    expect(ineligibleReason(container('3'), 'OUTBOUND')).toBe('Not on a shelf')
    expect(ineligibleReason(container('4', shelved), 'INTERNAL')).toBeNull()
    expect(ineligibleReason(container('5'), 'INTERNAL')).toBe('Not on a shelf')
  })
})

describe('groupContainers', () => {
  it('INBOUND puts confirmed receiving vouchers first, newest on top, then the others', () => {
    const groups = groupContainers(
      [
        container('a', { voucher: receipt('old', 'PN-OLD', '2026-11-12T00:00:00Z') }),
        container('b'),
        container('c', { voucher: receipt('new', 'PN-NEW', '2026-11-13T00:00:00Z') }),
        container('d', { voucher: receipt('new', 'PN-NEW', '2026-11-13T00:00:00Z') }),
      ],
      'INBOUND',
    )
    expect(groups.map((g) => g.title)).toEqual(['PN-NEW', 'PN-OLD', 'Other containers'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['c', 'd'])
    expect(groups[0].voucher).toBe(true)
  })

  it('INTERNAL groups by shelf, containers without one last', () => {
    const groups = groupContainers(
      [container('a', { ...shelved, currentLocationCode: 'SHELF-B' }), container('b'), container('c', shelved)],
      'INTERNAL',
    )
    expect(groups.map((g) => g.title)).toEqual(['SHELF-A-01', 'SHELF-B', 'Not on a shelf'])
  })
})

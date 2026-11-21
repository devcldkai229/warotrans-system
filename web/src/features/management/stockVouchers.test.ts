import { describe, expect, it } from 'vitest'
import { dispatchableLine } from './stockVouchers'

describe('dispatchableLine', () => {
  const line = (containerStatus: string, extra: { done?: boolean; closedShort?: boolean } = {}) => ({ done: false, containerStatus, ...extra })

  it('sends robots for received inbound Containers only', () => {
    expect(dispatchableLine('INBOUND', line('CREATED'))).toBe(true)
    expect(dispatchableLine('INBOUND', line('PACKED'))).toBe(true)
    expect(dispatchableLine('INBOUND', line('IN_TRANSIT'))).toBe(false)
    expect(dispatchableLine('INBOUND', line('STORED', { done: true }))).toBe(false)
  })

  it('sends robots for outbound Containers still on their shelf', () => {
    expect(dispatchableLine('OUTBOUND', line('STORED'))).toBe(true)
    expect(dispatchableLine('OUTBOUND', line('IN_TRANSIT'))).toBe(false)
    expect(dispatchableLine('OUTBOUND', line('HOLD'))).toBe(false)
    expect(dispatchableLine('OUTBOUND', line('ISSUED', { done: true }))).toBe(false)
  })

  it('never for a line closed short', () => {
    expect(dispatchableLine('OUTBOUND', line('STORED', { closedShort: true }))).toBe(false)
  })
})

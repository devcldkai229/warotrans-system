import { describe, expect, it } from 'vitest'
import { code128B, code128BValues, labelSheetHtml, qrMatrix } from './labels'

describe('labels (same encoders as the mobile app)', () => {
  it('encodes Code 128 B with its checksum, 11 modules per symbol and 13 for stop', () => {
    expect(code128BValues('ABC')).toEqual([104, 33, 34, 35, 1, 106])
    expect(code128B('C181126001').reduce((sum, w) => sum + w, 0)).toBe(12 * 11 + 13)
  })
  it('builds a square QR with finder corners and one label per code', () => {
    const qr = qrMatrix('WT:C:C181126001')
    expect((qr.size - 17) % 4).toBe(0)
    expect(qr.dark(0, 0) && qr.dark(qr.size - 1, 0) && qr.dark(0, qr.size - 1)).toBe(true)
    expect(labelSheetHtml([{ code: 'C1', qr: 'WT:C:C1' }, { code: 'C2', qr: 'WT:C:C2' }]).match(/class="label"/g)).toHaveLength(2)
  })
})

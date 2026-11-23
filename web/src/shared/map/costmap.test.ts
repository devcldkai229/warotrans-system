import { describe, expect, it } from 'vitest'
import { cellCorner, maskPixel } from './costmap'

describe('costmap helpers', () => {
  it('turns a traffic cell id into its lower-left corner in metres', () => {
    expect(cellCorner('cell:3:-12', 0.1)).toEqual({ x: 0.30000000000000004, y: -1.2000000000000002 })
    expect(cellCorner('zone:ZONE-AREA-INBOUND', 0.1)).toBeNull()
  })

  it('paints keep-out where map_server reads the pixel as occupied, nothing elsewhere', () => {
    expect(maskPixel('keepout', 0, 'trinary')[3]).toBeGreaterThan(0)
    expect(maskPixel('keepout', 254, 'trinary')[3]).toBe(0)
  })

  it('paints a speed limit darker when slower and leaves "no limit" transparent', () => {
    expect(maskPixel('speed', 0, 'raw')[3]).toBe(0)
    expect(maskPixel('speed', 100, 'raw')[3]).toBe(0)
    expect(maskPixel('speed', 30, 'raw')[3]).toBeGreaterThan(maskPixel('speed', 70, 'raw')[3])
  })
})

import { costPixel } from './costmap'

describe('live Nav2 costmap colours', () => {
  it('shows lethal strongest, free as nothing, unknown faint', () => {
    expect(costPixel(100)[3]).toBeGreaterThan(costPixel(99)[3])
    expect(costPixel(0)[3]).toBe(0)
    expect(costPixel(255)[3]).toBeLessThan(costPixel(50)[3])
    expect(costPixel(90)[3]).toBeGreaterThan(costPixel(10)[3])
  })
})

import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { cellShade, decodeGrid, formatElapsed, gridToRgba, mappingActions, poseInsideGrid, UNKNOWN, worldToPixel } from './mappingGrid'

// zlib.deflateSync writes RFC 1950 (zlib), like the robot's Python zlib.compress.
const message = (cells: number[], width: number, height: number) => ({
  width,
  height,
  resolution: 0.1,
  originX: -1,
  originY: -2,
  originYaw: 0,
  fullWidth: width,
  fullHeight: height,
  knownAreaM2: 1.5,
  encoding: 'zlib+base64',
  cells: deflateSync(Buffer.from(cells)).toString('base64'),
})

describe('map building live view', () => {
  it('decodes the robot grid (zlib + base64) and keeps its size', async () => {
    const grid = await decodeGrid(message([0, 100, UNKNOWN, 50, 0, 0], 3, 2))
    expect(grid.width).toBe(3)
    expect(Array.from(grid.cells)).toEqual([0, 100, 255, 50, 0, 0])
  })

  it('refuses a grid whose cell count does not match', async () => {
    await expect(decodeGrid(message([0, 0, 0], 2, 2))).rejects.toThrow(/expected 2x2/)
  })

  it('draws bottom-up rows top-down, free white, wall black, unknown grey', async () => {
    const grid = await decodeGrid(message([100, 0, UNKNOWN, 0], 2, 2))
    const rgba = gridToRgba(grid)
    // image row 0 = grid row 1 (the top of the map)
    expect([rgba[0], rgba[4]]).toEqual([cellShade(UNKNOWN), cellShade(0)])
    expect([rgba[8], rgba[12]]).toEqual([0, 254])
    expect(rgba[3]).toBe(255)
  })

  it('places a map-frame pose on the image', async () => {
    const grid = await decodeGrid(message(new Array(20 * 10).fill(0), 20, 10))
    expect(worldToPixel(grid, -1, -2)).toEqual({ col: 0, row: 10 }) // origin = bottom-left corner
    expect(worldToPixel(grid, 0, -1.5)).toEqual({ col: 10, row: 5 })
    expect(poseInsideGrid(grid, { x: 0, y: -1.5, yaw: 0 })).toBe(true)
    expect(poseInsideGrid(grid, { x: 5, y: 0, yaw: 0 })).toBe(false)
    expect(poseInsideGrid(null, { x: 0, y: 0, yaw: 0 })).toBe(false)
  })

  it('says what the operator may do in each state', () => {
    expect(mappingActions('MAPPING')).toMatchObject({ canDrive: true, canFinish: true, canCancel: true, closed: false })
    expect(mappingActions('STARTING')).toMatchObject({ canDrive: false, canCancel: true, waiting: true })
    expect(mappingActions('SAVING')).toMatchObject({ canFinish: false, canCancel: false, waiting: true })
    expect(mappingActions('COMPLETED').closed).toBe(true)
  })

  it('formats the elapsed time', () => {
    expect(formatElapsed(125.4)).toBe('2:05')
    expect(formatElapsed(null)).toBe('—')
  })
})
